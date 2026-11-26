import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '../src/database/prisma.js';
import { hashPassword } from '../src/utils/security.js';

export const PASSWORD = 'Str0ngPass1';
export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

export async function makeAdmin(app: Express, domain: string) {
  const email = `admin-${uniq()}${domain}`;
  await prisma.user.create({
    data: { email, passwordHash: await hashPassword(PASSWORD), name: 'Admin', role: 'ADMIN' },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return bearer(login.body.data.accessToken as string);
}

export async function makeSeller(app: Express, domain: string, opts: { approved?: boolean } = {}) {
  const email = `seller-${uniq()}${domain}`;
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
  if (opts.approved) {
    await prisma.seller.update({ where: { id: seller.id }, data: { status: 'APPROVED', approvedAt: new Date() } });
  }
  return {
    email,
    auth: bearer(res.body.data.accessToken as string),
    sellerId: seller.id,
    userId: seller.userId,
  };
}

export async function makeBuyer(app: Express, domain: string) {
  const email = `buyer-${uniq()}${domain}`;
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Buyer', email, password: PASSWORD });
  return { email, auth: bearer(res.body.data.accessToken as string) };
}

/** Removes everything created under a test email domain, in FK-safe order. */
export async function cleanupDomain(domain: string) {
  const sellers = { seller: { user: { email: { endsWith: domain } } } };
  // The ledger is append-only by trigger; test cleanup is the only place that may bypass it.
  await prisma.$transaction([
    prisma.$executeRawUnsafe('ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_immutable'),
    prisma.stockMovement.deleteMany({ where: sellers }),
    prisma.$executeRawUnsafe('ALTER TABLE stock_movements ENABLE TRIGGER stock_movements_immutable'),
  ]);
  await prisma.stockAdjustment.deleteMany({ where: { inventory: { warehouse: sellers } } });
  await prisma.inventory.deleteMany({ where: { warehouse: sellers } });
  await prisma.product.deleteMany({ where: sellers });
  await prisma.warehouse.deleteMany({ where: sellers });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

export async function anyCategoryId() {
  return (await prisma.category.findFirstOrThrow({ where: { parentId: { not: null }, active: true } })).id;
}
