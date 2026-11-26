import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { csvCell, rupees, toCsv } from '../src/utils/csv.js';
import { clearSettingsCache } from '../src/modules/settings/settings.service.js';
import { anyCategoryId, cleanupDomain, makeAdmin, makeBuyer, makeSeller, publishProduct, uniq } from './helpers.js';

const app = createApp();
const DOMAIN = '@reportstest.local';

type Auth = { auth: object };
const as = (b: Auth) => b.auth as Record<string, string>;

let admin: Record<string, string>;
let sellerA: Awaited<ReturnType<typeof makeSeller>>;
let sellerB: Awaited<ReturnType<typeof makeSeller>>;
let categoryId: string;

beforeAll(async () => {
  admin = await makeAdmin(app, DOMAIN);
  sellerA = await makeSeller(app, DOMAIN, { approved: true });
  sellerB = await makeSeller(app, DOMAIN, { approved: true });
  categoryId = await anyCategoryId();
  clearSettingsCache();
});

afterAll(async () => {
  await prisma.platformSetting.deleteMany({ where: { key: 'lowStockDefault' } });
  await prisma.sellerSettlement.deleteMany({ where: { seller: { user: { email: { endsWith: DOMAIN } } } } });
  await cleanupDomain(DOMAIN);
  await prisma.$disconnect();
});

async function buyerOrder(seller: typeof sellerA, qty: number, addressName = 'Report Buyer') {
  const buyer = await makeBuyer(app, DOMAIN);
  const addr = await request(app).post('/api/v1/addresses').set(as(buyer)).send({
    label: 'Home', name: addressName, phone: '9876543210', line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001',
  });
  const p = await publishProduct(app, seller, categoryId, { name: `R ${uniq()}`, price: 600, stock: 20 });
  await request(app).post('/api/v1/cart/items').set(as(buyer)).send({ variantId: p.variants[0]!.id, quantity: qty });
  const res = await request(app).post('/api/v1/orders').set(as(buyer)).send({ addressId: addr.body.data.address.id, paymentMethod: 'UPI' });
  expect(res.status).toBe(201);
  const order = res.body.data.order;
  return { order, sid: order.shipments[0].id as string, buyer };
}
const act = (seller: typeof sellerA, id: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/seller/orders/${id}/actions`).set(seller.auth).send(body);
const deliver = async (seller: typeof sellerA, sid: string) => {
  for (const a of [{ action: 'accept' }, { action: 'process' }, { action: 'pack' }, { action: 'ship', carrier: 'DTDC' }, { action: 'deliver' }]) {
    expect((await act(seller, sid, a)).status).toBe(200);
  }
};

describe('csv helpers', () => {
  it('formats paise exactly and escapes cells', () => {
    expect(rupees(123456)).toBe('1234.56');
    expect(rupees(5)).toBe('0.05');
    expect(rupees(100)).toBe('1.00');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(toCsv(['a'], [['x']]).startsWith('﻿')).toBe(true);
  });
});

describe('seller reports reconcile with the database', () => {
  it('counts only shipments that stayed sold, and sales = commission + net + delivery', async () => {
    const delivered = await buyerOrder(sellerA, 2);
    await deliver(sellerA, delivered.sid);
    const placed = await buyerOrder(sellerA, 1);
    const cancelled = await buyerOrder(sellerA, 1);
    await request(app).post(`/api/v1/orders/${cancelled.order.id}/cancel`).set(as(cancelled.buyer)).send({ reason: 'Changed my mind' });
    await buyerOrder(sellerB, 3); // another seller's sale must not leak in

    const res = await request(app).get('/api/v1/seller/reports/summary?days=7').set(sellerA.auth);
    expect(res.status).toBe(200);
    const d = res.body.data;

    const rows = await prisma.sellerOrder.findMany({ where: { sellerId: sellerA.sellerId, status: { notIn: ['CANCELLED', 'RETURNED'] } }, include: { commission: true, items: true } });
    const sales = rows.reduce((n, r) => n + r.totalPaise, 0);
    expect(d.kpis.salesPaise).toBe(sales);
    expect(d.kpis.orders).toBe(2);
    expect(d.kpis.units).toBe(3);
    expect(d.kpis.avgOrderPaise).toBe(Math.round(sales / 2));
    expect(d.kpis.cancelled).toBe(1);
    expect(d.kpis.pendingFulfilment).toBe(1);
    // Reconciliation identity.
    expect(d.kpis.commissionPaise + d.kpis.netToSellersPaise + d.kpis.deliveryPaise).toBe(sales);
    expect(d.kpis.commissionPaise).toBe(rows.reduce((n, r) => n + (r.commission?.amountPaise ?? 0), 0));
    // The chart series adds up to the headline and covers every day of the window.
    expect(d.series).toHaveLength(7);
    expect(d.series.reduce((n: number, s: { salesPaise: number }) => n + s.salesPaise, 0)).toBe(sales);
    expect(d.series.at(-1).orders).toBe(2);
    expect(d.statusBreakdown.reduce((n: number, s: { count: number }) => n + s.count, 0)).toBe(3);
    expect(d.topItems[0].units).toBeGreaterThan(0);
    expect(d.payouts.readyToSettlePaise).toBe(rows.filter((r) => r.status === 'DELIVERED').reduce((n, r) => n + (r.commission?.netSellerPaise ?? 0), 0));
    expect(placed.sid).toBeTruthy();
  });

  it('validates the range and requires a seller', async () => {
    expect((await request(app).get('/api/v1/seller/reports/summary?days=5').set(sellerA.auth)).status).toBe(422);
    expect((await request(app).get('/api/v1/seller/reports/summary')).status).toBe(401);
    expect((await request(app).get('/api/v1/seller/reports/summary').set(as(await makeBuyer(app, DOMAIN)))).status).toBe(403);
    expect((await request(app).get('/api/v1/seller/reports/summary').set(admin)).status).toBe(403);
  });

  it('exports the seller\'s own orders as safe CSV', async () => {
    await buyerOrder(sellerB, 1, '=HYPERLINK("http://x.test")');
    const res = await request(app).get('/api/v1/seller/reports/orders.csv?days=7').set(sellerB.auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="my-orders-\d{4}-\d{2}-\d{2}\.csv"/);
    const lines = res.text.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toContain('Order no');
    expect(lines.length).toBe(1 + (await prisma.sellerOrder.count({ where: { sellerId: sellerB.sellerId } })));
    expect(res.text).toContain(`"'=HYPERLINK(""http://x.test"")"`); // formula neutralised
    // Seller A's orders are not in B's export.
    const aNo = (await prisma.order.findFirstOrThrow({ where: { sellerOrders: { some: { sellerId: sellerA.sellerId } } } })).orderNo;
    expect(res.text).not.toContain(aNo);
  });
});

describe('settlements', () => {
  it('settles delivered earnings once, then marks them paid', async () => {
    const o = await buyerOrder(sellerB, 2);
    await deliver(sellerB, o.sid);
    const delivered = await prisma.sellerOrder.findMany({ where: { sellerId: sellerB.sellerId, status: 'DELIVERED', commission: { settlementId: null } }, include: { commission: true } });
    const net = delivered.reduce((n, r) => n + (r.commission?.netSellerPaise ?? 0), 0);
    const fee = delivered.reduce((n, r) => n + (r.commission?.amountPaise ?? 0), 0);

    const pend = await request(app).get('/api/v1/admin/settlements').set(admin);
    const mine = pend.body.data.pending.find((p: { sellerId: string }) => p.sellerId === sellerB.sellerId);
    expect(mine).toMatchObject({ netPaise: net, commissionPaise: fee, shipments: delivered.length });
    // Shipments that are not delivered yet are not settleable: seller A has none delivered unsettled except its own.
    expect((await request(app).post('/api/v1/admin/settlements').set(sellerA.auth).send({ sellerId: sellerB.sellerId })).status).toBe(403);

    const created = await request(app).post('/api/v1/admin/settlements').set(admin).send({ sellerId: sellerB.sellerId });
    expect(created.status).toBe(201);
    const s = created.body.data.settlement;
    expect(s).toMatchObject({ netPaise: net, commissionPaise: fee, grossPaise: net + fee, status: 'PENDING' });
    expect(await prisma.commission.count({ where: { settlementId: s.id } })).toBe(delivered.length);

    // Nothing left to settle.
    const again = await request(app).post('/api/v1/admin/settlements').set(admin).send({ sellerId: sellerB.sellerId });
    expect(again.status).toBe(409);

    const mineList = await request(app).get('/api/v1/seller/reports/settlements').set(sellerB.auth);
    expect(mineList.body.data.items.map((i: { id: string }) => i.id)).toContain(s.id);
    const otherList = await request(app).get('/api/v1/seller/reports/settlements').set(sellerA.auth);
    expect(otherList.body.data.items.map((i: { id: string }) => i.id)).not.toContain(s.id);

    const summary = await request(app).get('/api/v1/seller/reports/summary').set(sellerB.auth);
    expect(summary.body.data.payouts).toMatchObject({ readyToSettlePaise: 0, inPendingSettlementPaise: net, paidPaise: 0 });

    expect((await request(app).post(`/api/v1/admin/settlements/${s.id}/pay`).set(admin)).body.data.status).toBe('PAID');
    expect((await request(app).post(`/api/v1/admin/settlements/${s.id}/pay`).set(admin)).status).toBe(409);
    expect((await request(app).get('/api/v1/seller/reports/summary').set(sellerB.auth)).body.data.payouts.paidPaise).toBe(net);
    expect(await prisma.auditLog.count({ where: { entityId: s.id, action: { in: ['settlement.create', 'settlement.paid'] } } })).toBe(2);
  });

  it('rejects unknown sellers and malformed ids', async () => {
    expect((await request(app).post('/api/v1/admin/settlements').set(admin).send({ sellerId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await request(app).post('/api/v1/admin/settlements').set(admin).send({ sellerId: 'nope' })).status).toBe(422);
    expect((await request(app).post('/api/v1/admin/settlements/00000000-0000-4000-8000-000000000000/pay').set(admin)).status).toBe(404);
  });
});

describe('admin analytics, orders and exports', () => {
  it('summarises the platform and lists orders with their commission', async () => {
    const o = await buyerOrder(sellerA, 1);
    const res = await request(app).get('/api/v1/admin/reports/summary?days=30').set(admin);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.series).toHaveLength(30);
    expect(d.kpis.salesPaise).toBeGreaterThanOrEqual(o.order.totalPaise);
    expect(d.inventory.unitsAvailable).toBeGreaterThan(0);
    expect(Array.isArray(d.topSellers)).toBe(true);
    expect(Array.isArray(d.categories)).toBe(true);
    expect((await request(app).get('/api/v1/admin/reports/summary').set(sellerA.auth)).status).toBe(403);

    const list = await request(app).get(`/api/v1/admin/orders?q=${o.order.orderNo}`).set(admin);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0]).toMatchObject({ orderNo: o.order.orderNo, shipments: 1, totalPaise: o.order.totalPaise });
    const detail = await request(app).get(`/api/v1/admin/orders/${o.order.id}`).set(admin);
    expect(detail.status).toBe(200);
    expect(detail.body.data.order.buyer.email).toMatch(DOMAIN);
    expect(detail.body.data.order.shipments[0].commission.rateBp).toBe(1000);
    expect((await request(app).get(`/api/v1/admin/orders/${o.order.id}`).set(o.buyer.auth as Record<string, string>)).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/orders?status=BOGUS').set(admin)).status).toBe(422);
  });

  it('exports orders and commissions as CSV for admins only', async () => {
    const orders = await request(app).get('/api/v1/admin/reports/orders.csv?days=7').set(admin);
    expect(orders.status).toBe(200);
    expect(orders.text).toContain('Commission (INR)');
    const comm = await request(app).get('/api/v1/admin/reports/commissions.csv').set(admin);
    expect(comm.status).toBe(200);
    expect(comm.text).toContain('Settlement status');
    expect((await request(app).get('/api/v1/admin/reports/orders.csv').set(sellerA.auth)).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/reports/commissions.csv')).status).toBe(401);
  });
});

describe('platform settings', () => {
  it('validates ranges, applies changes and records an audit entry', async () => {
    const get = await request(app).get('/api/v1/admin/settings').set(admin);
    expect(get.status).toBe(200);
    expect(get.body.data.defaults.commissionBp).toBe(1000);

    expect((await request(app).put('/api/v1/admin/settings').set(admin).send({ commissionBp: 9999 })).status).toBe(422);
    expect((await request(app).put('/api/v1/admin/settings').set(admin).send({ commissionBp: 12.5 })).status).toBe(422);
    expect((await request(app).put('/api/v1/admin/settings').set(admin).send({})).status).toBe(422);
    expect((await request(app).put('/api/v1/admin/settings').set(sellerA.auth).send({ lowStockDefault: 3 })).status).toBe(403);

    // lowStockDefault is not used by other test files, so changing it here cannot disturb them.
    const put = await request(app).put('/api/v1/admin/settings').set(admin).send({ lowStockDefault: 7 });
    expect(put.status).toBe(200);
    expect(put.body.data.values.lowStockDefault).toBe(7);
    expect((await request(app).get('/api/v1/admin/settings').set(admin)).body.data.values.lowStockDefault).toBe(7);
    const log = await prisma.auditLog.findFirst({ where: { action: 'settings.update', actor: { email: { endsWith: DOMAIN } } }, orderBy: { createdAt: 'desc' } });
    expect(log?.meta).toMatchObject({ after: { lowStockDefault: 7 } });
  });
});
