import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { hashPassword } from '../src/utils/security.js';

const app = createApp();
const PASSWORD = 'Str0ngPass1';
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const email = (tag: string) => `${tag}-${uniq()}@authtest.local`;

const cookieOf = (res: request.Response): string => {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const c = raw?.find((x) => x.startsWith('ss_rt='));
  if (!c) throw new Error('no refresh cookie');
  return c.split(';')[0]!;
};

async function registerBuyer(e = email('buyer')) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Test Buyer', email: e, password: PASSWORD });
  return { res, email: e };
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  // Warehouses intentionally have no cascade from sellers, so remove them first.
  await prisma.warehouse.deleteMany({ where: { seller: { user: { email: { endsWith: '@authtest.local' } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@authtest.local' } } });
  await prisma.$disconnect();
});

describe('registration', () => {
  it('registers a buyer, returns an access token and sets an httpOnly refresh cookie', async () => {
    const { res } = await registerBuyer();
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('BUYER');
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('creates the buyer profile, wishlist and cart', async () => {
    const { email: e } = await registerBuyer();
    const u = await prisma.user.findUnique({
      where: { email: e },
      include: { buyerProfile: { include: { wishlist: true } }, cart: true },
    });
    expect(u?.buyerProfile?.wishlist).toBeTruthy();
    expect(u?.cart).toBeTruthy();
  });

  it('rejects duplicate emails with 409', async () => {
    const { email: e } = await registerBuyer();
    const dup = await registerBuyer(e);
    expect(dup.res.status).toBe(409);
    expect(dup.res.body.error.code).toBe('CONFLICT');
  });

  it('validates input with 422 and field details', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'A', email: 'nope', password: 'weak' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(
      expect.arrayContaining(['name', 'email', 'password']),
    );
  });

  it('stores passwords hashed', async () => {
    const { email: e } = await registerBuyer();
    const u = await prisma.user.findUnique({ where: { email: e } });
    expect(u?.passwordHash).not.toContain(PASSWORD);
    expect(u?.passwordHash.startsWith('$2')).toBe(true);
  });

  it('registers a seller as PENDING with a store and default warehouse', async () => {
    const e = email('seller');
    const res = await request(app)
      .post('/api/v1/auth/register-seller')
      .send({
        name: 'Test Seller',
        email: e,
        password: PASSWORD,
        phone: '9876543210',
        businessName: 'Test Traders',
        storeName: 'Test Store',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ role: 'SELLER', sellerStatus: 'PENDING' });
    const seller = await prisma.seller.findFirst({
      where: { user: { email: e } },
      include: { store: true, warehouses: true },
    });
    expect(seller?.status).toBe('PENDING');
    expect(seller?.store?.slug).toMatch(/^test-store/);
    expect(seller?.warehouses).toHaveLength(1);
  });
});

describe('login', () => {
  it('logs in with correct credentials', async () => {
    const { email: e } = await registerBuyer();
    const res = await request(app).post('/api/v1/auth/login').send({ email: e, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('returns the same generic 401 for wrong password and unknown email', async () => {
    const { email: e } = await registerBuyer();
    const wrong = await request(app).post('/api/v1/auth/login').send({ email: e, password: 'Wrong1234' });
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: email('ghost'), password: 'Wrong1234' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks the account after 5 failed attempts, even with the right password', async () => {
    const { email: e } = await registerBuyer();
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/v1/auth/login').send({ email: e, password: 'Wrong1234' });
      expect(r.status).toBe(401);
    }
    const locked = await request(app).post('/api/v1/auth/login').send({ email: e, password: PASSWORD });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('blocks suspended users', async () => {
    const { email: e } = await registerBuyer();
    await prisma.user.update({ where: { email: e }, data: { status: 'SUSPENDED' } });
    const res = await request(app).post('/api/v1/auth/login').send({ email: e, password: PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe('access control', () => {
  it('rejects missing and malformed tokens with 401', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    const bad = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.token');
    expect(bad.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    const { res, email: e } = await registerBuyer();
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(e);
  });

  it('enforces roles: buyers cannot reach admin or seller endpoints', async () => {
    const { res } = await registerBuyer();
    const auth = { Authorization: `Bearer ${res.body.data.accessToken}` };
    expect((await request(app).get('/api/v1/admin/ping').set(auth)).status).toBe(403);
    expect((await request(app).get('/api/v1/sellers/me').set(auth)).status).toBe(403);
  });

  it('lets an admin through and a seller read only their own profile', async () => {
    const adminEmail = email('admin');
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await hashPassword(PASSWORD),
        name: 'Admin',
        role: 'ADMIN',
      },
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: PASSWORD });
    const ping = await request(app)
      .get('/api/v1/admin/ping')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(ping.status).toBe(200);

    const s = await request(app)
      .post('/api/v1/auth/register-seller')
      .send({
        name: 'S One',
        email: email('s1'),
        password: PASSWORD,
        phone: '9876543210',
        businessName: 'S One Traders',
        storeName: 'S One Store',
      });
    const mine = await request(app)
      .get('/api/v1/sellers/me')
      .set('Authorization', `Bearer ${s.body.data.accessToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.seller.store.name).toBe('S One Store');
    expect((await request(app).get('/api/v1/admin/ping').set('Authorization', `Bearer ${s.body.data.accessToken}`)).status).toBe(403);
  });
});

describe('refresh token rotation', () => {
  it('issues a new access token and rotates the refresh cookie', async () => {
    const { res } = await registerBuyer();
    const c1 = cookieOf(res);
    const r = await request(app).post('/api/v1/auth/refresh').set('Cookie', c1);
    expect(r.status).toBe(200);
    expect(r.body.data.accessToken).toBeTruthy();
    expect(cookieOf(r)).not.toBe(c1);
  });

  it('rejects a missing cookie', async () => {
    expect((await request(app).post('/api/v1/auth/refresh')).status).toBe(401);
  });

  it('revokes the whole session family when an old token is replayed after the grace window', async () => {
    const { res } = await registerBuyer();
    const c1 = cookieOf(res);
    const r2 = await request(app).post('/api/v1/auth/refresh').set('Cookie', c1);
    const c2 = cookieOf(r2);

    // Age the rotated session beyond the reuse grace window.
    await prisma.userSession.updateMany({
      where: { revokedAt: { not: null }, user: { email: { endsWith: '@authtest.local' } } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', c1);
    expect(replay.status).toBe(401);
    // The legitimate, newer token in the same family is now dead too.
    const after = await request(app).post('/api/v1/auth/refresh').set('Cookie', c2);
    expect(after.status).toBe(401);
  });

  it('lets only one of two concurrent refreshes win', async () => {
    const { res } = await registerBuyer();
    const c = cookieOf(res);
    const [a, b] = await Promise.all([
      request(app).post('/api/v1/auth/refresh').set('Cookie', c),
      request(app).post('/api/v1/auth/refresh').set('Cookie', c),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('rejects refresh requests from untrusted origins', async () => {
    const { res } = await registerBuyer();
    const r = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieOf(res))
      .set('Origin', 'https://evil.example');
    expect(r.status).toBe(403);
  });

  it('logout revokes the session', async () => {
    const { res } = await registerBuyer();
    const c = cookieOf(res);
    expect((await request(app).post('/api/v1/auth/logout').set('Cookie', c)).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', c)).status).toBe(401);
  });
});

describe('password reset (demo simulation)', () => {
  it('resets the password once, revokes sessions, and the link cannot be reused', async () => {
    const { res, email: e } = await registerBuyer();
    const forgot = await request(app).post('/api/v1/auth/forgot-password').send({ email: e });
    expect(forgot.status).toBe(200);
    const token = forgot.body.data.demoResetToken as string;
    expect(token).toBeTruthy();

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'NewStr0ngPass' });
    expect(reset.status).toBe(200);

    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieOf(res))).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: e, password: PASSWORD })).status).toBe(401);
    expect(
      (await request(app).post('/api/v1/auth/login').send({ email: e, password: 'NewStr0ngPass' })).status,
    ).toBe(200);

    const again = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'AnotherPass9' });
    expect(again.status).toBe(400);
  });

  it('does not reveal whether an email exists', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: email('nobody') });
    expect(res.status).toBe(200);
    expect(res.body.data.demoResetToken).toBeUndefined();
  });

  it('rejects garbage tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'x'.repeat(40), password: 'NewStr0ngPass' });
    expect(res.status).toBe(400);
  });
});
