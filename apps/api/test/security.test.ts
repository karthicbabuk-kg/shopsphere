import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Router } from 'express';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { addressesRouter } from '../src/modules/addresses/addresses.routes.js';
import { cartRouter } from '../src/modules/cart/cart.routes.js';
import { adminRouter } from '../src/modules/admin/admin.routes.js';
import { checkoutRouter, ordersRouter, sellerOrdersRouter } from '../src/modules/orders/orders.routes.js';
import { adminReportsRouter, sellerReportsRouter } from '../src/modules/reports/reports.routes.js';
import { reviewsRouter } from '../src/modules/reviews/reviews.routes.js';
import { wishlistRouter } from '../src/modules/wishlist/wishlist.routes.js';
import { notificationsRouter } from '../src/modules/notifications/notifications.routes.js';
import { sellerProductsRouter } from '../src/modules/products/seller-products.routes.js';
import { uploadsRouter } from '../src/modules/uploads/uploads.routes.js';
import { inventoryRouter, stockAdjustmentsRouter, stockMovementsRouter, warehousesRouter } from '../src/modules/inventory/inventory.routes.js';
import { cleanupDomain, makeAdmin, makeBuyer, makeSeller, PASSWORD, uniq } from './helpers.js';

const app = createApp();
const DOMAIN = '@securitytest.local';
const UUID = '00000000-0000-4000-8000-000000000000';

type Role = 'BUYER' | 'SELLER' | 'ADMIN' | 'ANY';
const GROUPS: { name: string; router: Router; prefix: string; role: Role }[] = [
  { name: 'addresses', router: addressesRouter, prefix: '/addresses', role: 'BUYER' },
  { name: 'cart', router: cartRouter, prefix: '/cart', role: 'BUYER' },
  { name: 'wishlist', router: wishlistRouter, prefix: '/wishlist', role: 'BUYER' },
  { name: 'checkout', router: checkoutRouter, prefix: '/checkout', role: 'BUYER' },
  { name: 'orders', router: ordersRouter, prefix: '/orders', role: 'BUYER' },
  { name: 'reviews', router: reviewsRouter, prefix: '/reviews', role: 'BUYER' },
  { name: 'seller orders', router: sellerOrdersRouter, prefix: '/seller/orders', role: 'SELLER' },
  { name: 'seller reports', router: sellerReportsRouter, prefix: '/seller/reports', role: 'SELLER' },
  { name: 'seller products', router: sellerProductsRouter, prefix: '/seller/products', role: 'SELLER' },
  { name: 'uploads', router: uploadsRouter, prefix: '/uploads', role: 'SELLER' },
  { name: 'inventory', router: inventoryRouter, prefix: '/seller/inventory', role: 'SELLER' },
  { name: 'stock movements', router: stockMovementsRouter, prefix: '/seller/stock-movements', role: 'SELLER' },
  { name: 'stock adjustments', router: stockAdjustmentsRouter, prefix: '/seller/stock-adjustments', role: 'SELLER' },
  { name: 'warehouses', router: warehousesRouter, prefix: '/seller/warehouses', role: 'SELLER' },
  { name: 'admin', router: adminRouter, prefix: '/admin', role: 'ADMIN' },
  { name: 'admin reports', router: adminReportsRouter, prefix: '/admin', role: 'ADMIN' },
  { name: 'notifications', router: notificationsRouter, prefix: '/notifications', role: 'ANY' },
];

interface Endpoint { method: 'get' | 'post' | 'put' | 'patch' | 'delete'; url: string }

/** Reads the real route table, so a newly added route is covered automatically. */
function endpointsOf(g: (typeof GROUPS)[number]): Endpoint[] {
  const out: Endpoint[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const layer of (g.router as any).stack) {
    if (!layer.route) continue;
    const path = String(layer.route.path === '/' ? '' : layer.route.path).replace(/:\w+/g, UUID);
    for (const m of Object.keys(layer.route.methods)) out.push({ method: m as Endpoint['method'], url: `/api/v1${g.prefix}${path}` });
  }
  return out;
}

let tokens: Record<'BUYER' | 'SELLER' | 'ADMIN', Record<string, string>>;

beforeAll(async () => {
  const seller = await makeSeller(app, DOMAIN, { approved: true });
  tokens = { BUYER: (await makeBuyer(app, DOMAIN)).auth as Record<string, string>, SELLER: seller.auth, ADMIN: await makeAdmin(app, DOMAIN) };
});
afterAll(async () => {
  await cleanupDomain(DOMAIN);
  await prisma.$disconnect();
});

describe('authorization matrix (every route, from the real route table)', () => {
  const all = GROUPS.flatMap((g) => endpointsOf(g).map((e) => ({ ...e, group: g })));

  it('discovers a meaningful number of routes', () => {
    expect(all.length).toBeGreaterThan(70);
    for (const g of GROUPS) expect(endpointsOf(g).length, g.name).toBeGreaterThan(0);
  });

  it('rejects every protected route without a token (401)', async () => {
    const failures: string[] = [];
    for (const e of all) {
      const res = await request(app)[e.method](e.url).send({});
      if (res.status !== 401) failures.push(`${e.method.toUpperCase()} ${e.url} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('rejects every role-restricted route for the other roles (403)', async () => {
    const failures: string[] = [];
    for (const e of all.filter((x) => x.group.role !== 'ANY')) {
      for (const role of ['BUYER', 'SELLER', 'ADMIN'] as const) {
        if (role === e.group.role) continue;
        const res = await request(app)[e.method](e.url).set(tokens[role]).send({});
        if (res.status !== 403) failures.push(`${role} ${e.method.toUpperCase()} ${e.url} -> ${res.status}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('never answers 500 to garbage ids or empty bodies from the right role', async () => {
    const failures: string[] = [];
    for (const e of all.filter((x) => x.group.role !== 'ANY' && !x.url.includes('/uploads'))) {
      const url = e.url.replaceAll(UUID, 'not-a-uuid');
      const res = await request(app)[e.method](url).set(tokens[e.group.role as 'BUYER' | 'SELLER' | 'ADMIN']).send({});
      if (res.status >= 500) failures.push(`${e.method.toUpperCase()} ${url} -> ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
    }
    expect(failures).toEqual([]);
  });
});

describe('tokens and sessions', () => {
  it('rejects forged, unsigned and wrong-secret tokens', async () => {
    const claims = { sub: UUID, role: 'ADMIN' };
    const forged = jwt.sign(claims, 'x'.repeat(40));
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`;
    for (const t of [forged, none, 'garbage', '']) {
      const res = await request(app).get('/api/v1/admin/overview').set('Authorization', `Bearer ${t}`);
      expect(res.status, t.slice(0, 12)).toBe(401);
    }
  });

  it('ignores a role sent at registration and never returns password hashes', async () => {
    const email = `esc-${uniq()}${DOMAIN}`;
    const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Eve', email, password: PASSWORD, role: 'ADMIN', status: 'ACTIVE' });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.role).toBe('BUYER');
    const me = await request(app).get('/api/v1/auth/me').set({ Authorization: `Bearer ${reg.body.data.accessToken}` });
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect((await request(app).get('/api/v1/admin/overview').set({ Authorization: `Bearer ${reg.body.data.accessToken}` })).status).toBe(403);
  });

  it('does not reveal which emails are registered', async () => {
    const real = `known-${uniq()}${DOMAIN}`;
    await request(app).post('/api/v1/auth/register').send({ name: 'Known', email: real, password: PASSWORD });
    const wrongPw = await request(app).post('/api/v1/auth/login').send({ email: real, password: 'Wrong-pass-1' });
    const unknown = await request(app).post('/api/v1/auth/login').send({ email: `nobody-${uniq()}${DOMAIN}`, password: 'Wrong-pass-1' });
    expect(wrongPw.status).toBe(unknown.status);
    expect(wrongPw.body.error.message).toBe(unknown.body.error.message);
    const forgotKnown = await request(app).post('/api/v1/auth/forgot-password').send({ email: real });
    const forgotUnknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: `nobody-${uniq()}${DOMAIN}` });
    expect(forgotKnown.status).toBe(forgotUnknown.status);
  });
});

describe('HTTP hardening', () => {
  it('sends security headers and hides the framework', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('answers malformed and oversized bodies with 4xx JSON, not a stack trace', async () => {
    const bad = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(bad.status).toBe(400);
    expect(bad.body.success).toBe(false);
    expect(JSON.stringify(bad.body)).not.toMatch(/node_modules|at .*\.(ts|js):\d+/);
    const big = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(2 * 1024 * 1024) });
    expect(big.status).toBe(413);
    expect((await request(app).get('/api/v1/nope-not-a-route')).status).toBe(404);
  });

  it('only allows configured origins to read credentialed responses (CORS)', async () => {
    const evil = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const ok = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
  });

  it('treats SQL and HTML payloads in search as plain text', async () => {
    for (const q of ["' OR 1=1 --", '"; DROP TABLE users; --', '<script>alert(1)</script>', '%', '_', '\\']) {
      const res = await request(app).get('/api/v1/products').query({ q });
      expect(res.status, q).toBe(200);
      const sug = await request(app).get('/api/v1/products/suggest').query({ q });
      expect(sug.status, q).toBe(200);
    }
    expect(await prisma.user.count()).toBeGreaterThan(0);
  });
});

describe('abuse limits', () => {
  it('caps cart quantity and rejects negative or fractional amounts', async () => {
    for (const quantity of [0, -1, 1.5, 11, 1e9, '3']) {
      const res = await request(app).post('/api/v1/cart/items').set(tokens.BUYER).send({ variantId: UUID, quantity });
      expect(res.status, String(quantity)).toBe(422);
    }
  });

  it('rejects client-supplied prices on order placement', async () => {
    const res = await request(app).post('/api/v1/orders').set(tokens.BUYER).send({ addressId: UUID, paymentMethod: 'UPI', totalPaise: 1, pricePaise: 1 });
    // Unknown fields are stripped; the request then fails on the address, never on a price.
    expect([400, 409]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toMatch(/pricePaise/);
  });

  it('refuses malformed idempotency keys', async () => {
    const res = await request(app).post('/api/v1/orders').set(tokens.BUYER).set('Idempotency-Key', 'short').send({ addressId: UUID, paymentMethod: 'UPI' });
    expect(res.status).toBe(400);
  });
});
