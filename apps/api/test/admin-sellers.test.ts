import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { hashPassword } from '../src/utils/security.js';

const app = createApp();
const PASSWORD = 'Str0ngPass1';
const DOMAIN = '@admintest.local';
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let adminAuth: { Authorization: string };

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function newSeller(tag = 'seller') {
  const email = `${tag}-${uniq()}${DOMAIN}`;
  const res = await request(app)
    .post('/api/v1/auth/register-seller')
    .send({
      name: 'Seller',
      email,
      password: PASSWORD,
      phone: '9876543210',
      businessName: `Biz ${uniq()}`,
      storeName: `Store ${uniq()}`,
    });
  const seller = await prisma.seller.findFirstOrThrow({ where: { user: { email } } });
  return { email, token: res.body.data.accessToken as string, sellerId: seller.id, userId: seller.userId };
}

beforeAll(async () => {
  const email = `admin-${uniq()}${DOMAIN}`;
  await prisma.user.create({
    data: { email, passwordHash: await hashPassword(PASSWORD), name: 'Admin', role: 'ADMIN' },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  adminAuth = bearer(login.body.data.accessToken);
});

afterAll(async () => {
  await prisma.warehouse.deleteMany({ where: { seller: { user: { email: { endsWith: DOMAIN } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.$disconnect();
});

describe('admin access', () => {
  it('blocks anonymous, buyer and seller callers', async () => {
    const s = await newSeller();
    expect((await request(app).get('/api/v1/admin/overview')).status).toBe(401);
    expect((await request(app).get('/api/v1/admin/overview').set(bearer(s.token))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/sellers').set(bearer(s.token))).status).toBe(403);
    expect(
      (await request(app).post(`/api/v1/admin/sellers/${s.sellerId}/approve`).set(bearer(s.token))).status,
    ).toBe(403);
  });

  it('returns live platform KPIs', async () => {
    await newSeller();
    const res = await request(app).get('/api/v1/admin/overview').set(adminAuth);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.sellers.pending).toBeGreaterThanOrEqual(1);
    expect(d.sellers.total).toBe(
      d.sellers.active + d.sellers.pending + d.sellers.rejected + d.sellers.suspended,
    );
    expect(d.buyers).toEqual(expect.any(Number));
    expect(d.orders).toMatchObject({ total: expect.any(Number), grossPaise: expect.any(Number) });
  });
});

describe('seller listing', () => {
  it('filters by status, searches and paginates', async () => {
    const s = await newSeller('findme');
    const list = await request(app)
      .get('/api/v1/admin/sellers')
      .query({ status: 'PENDING', q: s.email, pageSize: 5 })
      .set(adminAuth);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].user.email).toBe(s.email);
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 5, total: 1 });
    expect(list.body.data.statusCounts.PENDING).toBeGreaterThanOrEqual(1);

    const none = await request(app)
      .get('/api/v1/admin/sellers')
      .query({ status: 'SUSPENDED', q: s.email })
      .set(adminAuth);
    expect(none.body.data.items).toHaveLength(0);
  });

  it('rejects invalid query and id values', async () => {
    expect((await request(app).get('/api/v1/admin/sellers?status=NOPE').set(adminAuth)).status).toBe(422);
    expect((await request(app).get('/api/v1/admin/sellers/not-a-uuid').set(adminAuth)).status).toBe(422);
  });
});

describe('approval workflow', () => {
  it('approves a pending seller, notifies them and writes an audit trail', async () => {
    const s = await newSeller();
    const res = await request(app).post(`/api/v1/admin/sellers/${s.sellerId}/approve`).set(adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.data.seller.status).toBe('APPROVED');

    const me = await request(app).get('/api/v1/sellers/me').set(bearer(s.token));
    expect(me.body.data.seller.status).toBe('APPROVED');

    const notes = await request(app).get('/api/v1/notifications').set(bearer(s.token));
    expect(notes.body.data.unread).toBe(1);
    expect(notes.body.data.items[0].title).toMatch(/approved/i);

    const log = await prisma.auditLog.findFirst({
      where: { entity: 'seller', entityId: s.sellerId, action: 'seller.approve' },
    });
    expect(log?.meta).toMatchObject({ from: 'PENDING', to: 'APPROVED' });
  });

  it('requires a reason to reject or suspend', async () => {
    const s = await newSeller();
    const noReason = await request(app).post(`/api/v1/admin/sellers/${s.sellerId}/reject`).set(adminAuth).send({});
    expect(noReason.status).toBe(422);

    const ok = await request(app)
      .post(`/api/v1/admin/sellers/${s.sellerId}/reject`)
      .set(adminAuth)
      .send({ reason: 'GST document is unreadable' });
    expect(ok.body.data.seller.status).toBe('REJECTED');
    const me = await request(app).get('/api/v1/sellers/me').set(bearer(s.token));
    expect(me.body.data.seller.rejectionReason).toBe('GST document is unreadable');
  });

  it('enforces valid transitions with 409', async () => {
    const s = await newSeller();
    const url = (a: string) => `/api/v1/admin/sellers/${s.sellerId}/${a}`;
    // Cannot suspend or reactivate a pending seller.
    expect((await request(app).post(url('suspend')).set(adminAuth).send({ reason: 'not allowed yet' })).status).toBe(409);
    expect((await request(app).post(url('reactivate')).set(adminAuth)).status).toBe(409);

    expect((await request(app).post(url('approve')).set(adminAuth)).status).toBe(200);
    // Cannot approve twice or reject an approved seller.
    expect((await request(app).post(url('approve')).set(adminAuth)).status).toBe(409);
    expect((await request(app).post(url('reject')).set(adminAuth).send({ reason: 'too late now' })).status).toBe(409);

    const suspended = await request(app).post(url('suspend')).set(adminAuth).send({ reason: 'Policy violation' });
    expect(suspended.body.data.seller.status).toBe('SUSPENDED');
    const back = await request(app).post(url('reactivate')).set(adminAuth);
    expect(back.body.data.seller.status).toBe('APPROVED');
    expect(back.body.data.seller.rejectionReason).toBeNull();
  });

  it('lets only one of two concurrent approvals succeed', async () => {
    const s = await newSeller();
    const call = () => request(app).post(`/api/v1/admin/sellers/${s.sellerId}/approve`).set(adminAuth);
    const [a, b] = await Promise.all([call(), call()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('returns 404 for unknown sellers', async () => {
    const res = await request(app)
      .post('/api/v1/admin/sellers/00000000-0000-4000-8000-000000000000/approve')
      .set(adminAuth);
    expect(res.status).toBe(404);
  });
});

describe('seller self-service and data isolation', () => {
  it('lets a seller update only their own store profile', async () => {
    const a = await newSeller('a');
    const b = await newSeller('b');
    const upd = await request(app)
      .patch('/api/v1/sellers/me')
      .set(bearer(a.token))
      .send({ description: 'Handmade goods', city: 'Chennai', state: 'Tamil Nadu' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.seller.store.city).toBe('Chennai');

    const other = await request(app).get('/api/v1/sellers/me').set(bearer(b.token));
    expect(other.body.data.seller.store.city).toBeNull();
    expect(other.body.data.seller.id).toBe(b.sellerId);
  });

  it('validates store updates', async () => {
    const a = await newSeller();
    const bad = await request(app).patch('/api/v1/sellers/me').set(bearer(a.token)).send({ contactPhone: '123' });
    expect(bad.status).toBe(422);
  });
});

describe('notifications', () => {
  it('marks only the caller\'s own notifications as read', async () => {
    const a = await newSeller('na');
    const b = await newSeller('nb');
    await request(app).post(`/api/v1/admin/sellers/${a.sellerId}/approve`).set(adminAuth);
    const notes = await request(app).get('/api/v1/notifications').set(bearer(a.token));
    const id = notes.body.data.items[0].id as string;

    expect((await request(app).post(`/api/v1/notifications/${id}/read`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app).post(`/api/v1/notifications/${id}/read`).set(bearer(a.token))).status).toBe(200);
    const after = await request(app).get('/api/v1/notifications').set(bearer(a.token));
    expect(after.body.data.unread).toBe(0);
  });
});
