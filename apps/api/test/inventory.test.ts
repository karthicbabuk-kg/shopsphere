import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import {
  commitSale,
  releaseStock,
  reserveStock,
  restockReturn,
} from '../src/modules/inventory/inventory.service.js';
import { anyCategoryId, cleanupDomain, makeBuyer, makeSeller, uniq } from './helpers.js';

const app = createApp();
const DOMAIN = '@inventorytest.local';

let categoryId: string;
type Seller = Awaited<ReturnType<typeof makeSeller>>;

beforeAll(async () => {
  categoryId = await anyCategoryId();
});

afterAll(async () => {
  await cleanupDomain(DOMAIN);
  await prisma.$disconnect();
});

/** Creates a product with one SKU and returns ids for the inventory row. */
async function product(s: Seller, opts: { stock?: number; reorder?: number; price?: number; sku?: string } = {}) {
  const sku = opts.sku ?? `INV-${uniq()}`.toUpperCase();
  const res = await request(app)
    .post('/api/v1/seller/products')
    .set(s.auth)
    .send({
      name: `Inventory Item ${uniq()}`,
      description: 'A product created for inventory operation tests.',
      categoryId,
      mrpPaise: (opts.price ?? 1000) * 100 + 5000,
      pricePaise: (opts.price ?? 1000) * 100,
      status: 'DRAFT',
      variants: [{ sku, label: 'Default', openingStock: opts.stock ?? 10, reorderLevel: opts.reorder ?? 5 }],
    });
  expect(res.status).toBe(201);
  const variantId = res.body.data.product.variants[0].id as string;
  const inv = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
  return { sku, variantId, inventoryId: inv.id, productId: res.body.data.product.id as string };
}

const op = (s: Seller, inventoryId: string, action: string, body: object) =>
  request(app).post(`/api/v1/seller/inventory/${inventoryId}/${action}`).set(s.auth).send(body);

const state = (inventoryId: string) => prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
const ledger = (inventoryId: string) =>
  prisma.stockMovement.findMany({ where: { inventoryId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

describe('stock operations and the ledger', () => {
  it('records inward, outward and adjustment with correct previous/change/new quantities', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 10 });

    const inward = await op(s, p.inventoryId, 'inward', { quantity: 15, reason: 'Supplier delivery', referenceNo: 'PO-7781' });
    expect(inward.status).toBe(201);
    expect(inward.body.data).toMatchObject({ previousQty: 10, newQty: 25, referenceNo: 'PO-7781' });

    const outward = await op(s, p.inventoryId, 'outward', { quantity: 5, reason: 'Damaged in storage' });
    expect(outward.body.data).toMatchObject({ previousQty: 25, newQty: 20 });
    expect(outward.body.data.referenceNo).toMatch(/^OUT-\d{8}-[0-9A-F]{6}$/);

    const adjust = await op(s, p.inventoryId, 'adjust', { delta: -3, reason: 'Shelf recount' });
    expect(adjust.body.data).toMatchObject({ previousQty: 20, newQty: 17 });

    expect((await state(p.inventoryId)).available).toBe(17);
    const rows = await ledger(p.inventoryId);
    expect(rows.map((r) => [r.type, r.previousQty, r.changeQty, r.newQty])).toEqual([
      ['OPENING', 0, 10, 10],
      ['INWARD', 10, 15, 25],
      ['OUTWARD', 25, -5, 20],
      ['ADJUSTMENT', 20, -3, 17],
    ]);
    expect(rows.every((r) => r.sellerId === s.sellerId && r.createdById === s.userId)).toBe(true);
    // Every row chains from the previous one: no gaps in history.
    rows.slice(1).forEach((r, i) => expect(r.previousQty).toBe(rows[i]!.newQty));
  });

  it('validates input and requires reasons for outward and manual adjustments', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s);
    expect((await op(s, p.inventoryId, 'inward', { quantity: 0 })).status).toBe(422);
    expect((await op(s, p.inventoryId, 'inward', { quantity: 1.5 })).status).toBe(422);
    expect((await op(s, p.inventoryId, 'inward', { quantity: -4 })).status).toBe(422);
    expect((await op(s, p.inventoryId, 'outward', { quantity: 1 })).status).toBe(422);
    expect((await op(s, p.inventoryId, 'adjust', { delta: 0, reason: 'nothing' })).status).toBe(422);
    expect((await op(s, p.inventoryId, 'adjust', { delta: 5 })).status).toBe(422);
    expect((await state(p.inventoryId)).available).toBe(10);
    expect(await ledger(p.inventoryId)).toHaveLength(1);
  });

  it('refuses to take more than is available and leaves no ledger row behind', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 4 });
    const out = await op(s, p.inventoryId, 'outward', { quantity: 5, reason: 'too many' });
    expect(out.status).toBe(409);
    expect(out.body.error.details).toMatchObject({ available: 4 });
    const adj = await op(s, p.inventoryId, 'adjust', { delta: -5, reason: 'too many' });
    expect(adj.status).toBe(409);
    expect((await state(p.inventoryId)).available).toBe(4);
    expect(await ledger(p.inventoryId)).toHaveLength(1);
  });

  it('isolates sellers: another seller cannot operate on, read or count this inventory', async () => {
    const a = await makeSeller(app, DOMAIN);
    const b = await makeSeller(app, DOMAIN);
    const p = await product(a, { stock: 10 });

    for (const [action, body] of [
      ['inward', { quantity: 5 }],
      ['outward', { quantity: 1, reason: 'steal' }],
      ['adjust', { delta: -1, reason: 'steal' }],
      ['count', { countedQty: 0 }],
    ] as const) {
      expect((await op(b, p.inventoryId, action, body)).status, action).toBe(404);
    }
    expect((await request(app).patch(`/api/v1/seller/inventory/${p.inventoryId}/settings`).set(b.auth).send({ reorderLevel: 99 })).status).toBe(404);

    const listB = await request(app).get('/api/v1/seller/inventory').set(b.auth);
    expect(listB.body.data.items).toHaveLength(0);
    const movesB = await request(app).get('/api/v1/seller/stock-movements').query({ inventoryId: p.inventoryId }).set(b.auth);
    expect(movesB.body.data.items).toHaveLength(0);
    expect((await state(p.inventoryId)).available).toBe(10);
  });

  it('rejects buyers and anonymous callers', async () => {
    const buyer = await makeBuyer(app, DOMAIN);
    expect((await request(app).get('/api/v1/seller/inventory').set(buyer.auth)).status).toBe(403);
    expect((await request(app).get('/api/v1/seller/inventory')).status).toBe(401);
  });
});

describe('concurrency: no overselling, no negative stock', () => {
  it('lets exactly the available number of parallel outward requests succeed', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 10 });
    const results = await Promise.all(
      Array.from({ length: 25 }, () => op(s, p.inventoryId, 'outward', { quantity: 1, reason: 'parallel sale' })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(results.filter((r) => r.status === 409)).toHaveLength(15);
    expect((await state(p.inventoryId)).available).toBe(0);
    const rows = await ledger(p.inventoryId);
    expect(rows.filter((r) => r.type === 'OUTWARD')).toHaveLength(10);
    expect(rows.every((r) => r.newQty >= 0)).toBe(true);
  });

  it('reserves stock atomically when many orders race for the last units', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 10 });
    const attempts = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) =>
        prisma.$transaction((tx) => reserveStock(tx, { variantId: p.variantId, quantity: 1, referenceNo: `ORD-${i}` })),
      ),
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(10);
    expect(attempts.filter((a) => a.status === 'rejected')).toHaveLength(20);
    expect(await state(p.inventoryId)).toMatchObject({ available: 0, reserved: 10, sold: 0 });
    expect((await ledger(p.inventoryId)).filter((r) => r.type === 'RESERVE')).toHaveLength(10);
  });

  it('rolls the reservation back with the rest of an order when a later line fails', async () => {
    const s = await makeSeller(app, DOMAIN);
    const plenty = await product(s, { stock: 10 });
    const scarce = await product(s, { stock: 1 });
    await expect(
      prisma.$transaction(async (tx) => {
        await reserveStock(tx, { variantId: plenty.variantId, quantity: 3, referenceNo: 'ORD-X' });
        await reserveStock(tx, { variantId: scarce.variantId, quantity: 2, referenceNo: 'ORD-X' });
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await state(plenty.inventoryId)).toMatchObject({ available: 10, reserved: 0 });
    expect(await ledger(plenty.inventoryId)).toHaveLength(1); // only OPENING
  });
});

describe('order lifecycle: reserve, release, sale, return', () => {
  it('keeps available, reserved and sold consistent through the whole lifecycle', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 10 });
    const total = async () => {
      const i = await state(p.inventoryId);
      return i.available + i.reserved + i.sold;
    };
    const run = <T>(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) => prisma.$transaction(fn);

    await run((tx) => reserveStock(tx, { variantId: p.variantId, quantity: 4, referenceNo: 'O1' }));
    expect(await state(p.inventoryId)).toMatchObject({ available: 6, reserved: 4, sold: 0 });

    await run((tx) => releaseStock(tx, { variantId: p.variantId, quantity: 1, referenceNo: 'O1' }));
    expect(await state(p.inventoryId)).toMatchObject({ available: 7, reserved: 3, sold: 0 });

    await run((tx) => commitSale(tx, { variantId: p.variantId, quantity: 3, referenceNo: 'O1' }));
    expect(await state(p.inventoryId)).toMatchObject({ available: 7, reserved: 0, sold: 3 });

    await run((tx) => restockReturn(tx, { variantId: p.variantId, quantity: 1, referenceNo: 'R1' }));
    expect(await state(p.inventoryId)).toMatchObject({ available: 8, reserved: 0, sold: 2 });
    expect(await total()).toBe(10);

    expect((await ledger(p.inventoryId)).map((r) => r.type)).toEqual(['OPENING', 'RESERVE', 'RELEASE', 'SALE', 'RETURN_RESTOCK']);
  });

  it('cannot release, sell or return more than exists', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 5 });
    await prisma.$transaction((tx) => reserveStock(tx, { variantId: p.variantId, quantity: 2, referenceNo: 'O2' }));
    await expect(prisma.$transaction((tx) => releaseStock(tx, { variantId: p.variantId, quantity: 3, referenceNo: 'O2' }))).rejects.toMatchObject({ status: 409 });
    await expect(prisma.$transaction((tx) => commitSale(tx, { variantId: p.variantId, quantity: 3, referenceNo: 'O2' }))).rejects.toMatchObject({ status: 409 });
    await expect(prisma.$transaction((tx) => restockReturn(tx, { variantId: p.variantId, quantity: 1, referenceNo: 'R2' }))).rejects.toMatchObject({ status: 409 });
    await expect(prisma.$transaction((tx) => reserveStock(tx, { variantId: p.variantId, quantity: 0, referenceNo: 'O3' }))).rejects.toMatchObject({ status: 400 });
    expect(await state(p.inventoryId)).toMatchObject({ available: 3, reserved: 2, sold: 0 });
  });
});

describe('stock counts and discrepancies', () => {
  it('a matching count needs no action; a mismatch opens a discrepancy', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 10 });
    const match = await op(s, p.inventoryId, 'count', { countedQty: 10 });
    expect(match.body.data.adjustment).toMatchObject({ status: 'APPLIED', difference: 0 });
    expect(await ledger(p.inventoryId)).toHaveLength(1);

    const mismatch = await op(s, p.inventoryId, 'count', { countedQty: 8, reason: 'Two units missing' });
    expect(mismatch.body.data.adjustment).toMatchObject({ status: 'OPEN', expectedQty: 10, countedQty: 8, difference: -2 });
    // Only one open count per SKU.
    expect((await op(s, p.inventoryId, 'count', { countedQty: 9 })).status).toBe(409);
    // The count itself does not move stock.
    expect((await state(p.inventoryId)).available).toBe(10);

    const summary = await request(app).get('/api/v1/seller/inventory/summary').set(s.auth);
    expect(summary.body.data.openDiscrepancies).toBe(1);
    expect(summary.body.data.alerts.discrepancies[0]).toMatchObject({ sku: p.sku, difference: -2 });
  });

  it('applies the counted difference to the current quantity so later movements are kept', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 10 });
    const adj = (await op(s, p.inventoryId, 'count', { countedQty: 8 })).body.data.adjustment;
    await op(s, p.inventoryId, 'outward', { quantity: 1, reason: 'sold offline' }); // 9 now

    const applied = await request(app).post(`/api/v1/seller/stock-adjustments/${adj.id}/apply`).set(s.auth);
    expect(applied.status).toBe(200);
    expect(applied.body.data).toMatchObject({ previousQty: 9, newQty: 7 });
    const last = (await ledger(p.inventoryId)).at(-1)!;
    expect(last).toMatchObject({ type: 'RECONCILIATION', changeQty: -2 });
    expect(last.reason).toContain('expected 10, counted 8');

    expect((await request(app).post(`/api/v1/seller/stock-adjustments/${adj.id}/apply`).set(s.auth)).status).toBe(409);
    expect((await request(app).post(`/api/v1/seller/stock-adjustments/${adj.id}/dismiss`).set(s.auth)).status).toBe(409);
  });

  it('lets only one of two concurrent applies succeed', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 10 });
    const adj = (await op(s, p.inventoryId, 'count', { countedQty: 6 })).body.data.adjustment;
    const call = () => request(app).post(`/api/v1/seller/stock-adjustments/${adj.id}/apply`).set(s.auth);
    const [x, y] = await Promise.all([call(), call()]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect((await state(p.inventoryId)).available).toBe(6);
  });

  it('refuses a correction that no longer fits, leaving the count open', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 5 });
    const adj = (await op(s, p.inventoryId, 'count', { countedQty: 0 })).body.data.adjustment; // -5
    await op(s, p.inventoryId, 'outward', { quantity: 4, reason: 'sold' }); // 1 left
    const res = await request(app).post(`/api/v1/seller/stock-adjustments/${adj.id}/apply`).set(s.auth);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/recount/i);
    expect((await state(p.inventoryId)).available).toBe(1);
    const list = await request(app).get('/api/v1/seller/stock-adjustments').query({ status: 'OPEN' }).set(s.auth);
    expect(list.body.data.items.map((i: { id: string }) => i.id)).toContain(adj.id);
  });

  it('dismisses a count without touching stock, and scopes counts to the owner', async () => {
    const a = await makeSeller(app, DOMAIN);
    const b = await makeSeller(app, DOMAIN);
    const p = await product(a, { stock: 10 });
    const adj = (await op(a, p.inventoryId, 'count', { countedQty: 12 })).body.data.adjustment;
    expect((await request(app).post(`/api/v1/seller/stock-adjustments/${adj.id}/apply`).set(b.auth)).status).toBe(404);
    expect((await request(app).post(`/api/v1/seller/stock-adjustments/${adj.id}/dismiss`).set(b.auth)).status).toBe(404);
    expect((await request(app).post(`/api/v1/seller/stock-adjustments/${adj.id}/dismiss`).set(a.auth)).status).toBe(200);
    expect((await state(p.inventoryId)).available).toBe(10);
    // After dismissal a new count can be recorded.
    expect((await op(a, p.inventoryId, 'count', { countedQty: 10 })).status).toBe(201);
  });
});

describe('alerts', () => {
  const notes = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type } });

  it('notifies once when stock crosses the reorder level and once when it runs out', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 6, reorder: 5 });

    await op(s, p.inventoryId, 'outward', { quantity: 1, reason: 'sale' }); // 6 -> 5: crosses
    expect(await notes(s.userId, 'inventory.low_stock')).toHaveLength(1);
    await op(s, p.inventoryId, 'outward', { quantity: 1, reason: 'sale' }); // 5 -> 4: already low
    expect(await notes(s.userId, 'inventory.low_stock')).toHaveLength(1);

    await op(s, p.inventoryId, 'outward', { quantity: 4, reason: 'sale' }); // 4 -> 0
    const out = await notes(s.userId, 'inventory.out_of_stock');
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toContain('is out of stock');

    // Restocking and falling again alerts again.
    await op(s, p.inventoryId, 'inward', { quantity: 20 });
    await op(s, p.inventoryId, 'outward', { quantity: 16, reason: 'bulk order' }); // 20 -> 4: crosses
    expect(await notes(s.userId, 'inventory.low_stock')).toHaveLength(2);
  });

  it('summarises levels, alert lists and valuation at selling price', async () => {
    const s = await makeSeller(app, DOMAIN);
    const healthy = await product(s, { stock: 20, reorder: 5, price: 500 });
    const low = await product(s, { stock: 3, reorder: 5, price: 200 });
    const out = await product(s, { stock: 0, reorder: 5, price: 100 });

    const res = await request(app).get('/api/v1/seller/inventory/summary').set(s.auth);
    const d = res.body.data;
    expect(d).toMatchObject({ skuCount: 3, unitsAvailable: 23, lowStockCount: 1, outOfStockCount: 1, openDiscrepancies: 0 });
    expect(d.valuationPaise).toBe(20 * 500 * 100 + 3 * 200 * 100);
    expect(d.alerts.outOfStock.map((a: { sku: string }) => a.sku)).toEqual([out.sku]);
    expect(d.alerts.reorderRequired.map((a: { sku: string }) => a.sku)).toEqual([low.sku]);
    expect(d.alerts.reorderRequired[0]).toMatchObject({ available: 3, reorderLevel: 5 });
    void healthy;
  });
});

describe('inventory list, ledger queries and settings', () => {
  it('filters the list by status and search, with paging', async () => {
    const s = await makeSeller(app, DOMAIN);
    const a = await product(s, { stock: 20, sku: `FIND-${uniq()}`.toUpperCase() });
    const b = await product(s, { stock: 2 });
    const c = await product(s, { stock: 0 });

    const all = await request(app).get('/api/v1/seller/inventory').set(s.auth);
    expect(all.body.meta.total).toBe(3);
    const statusOf = (id: string) => all.body.data.items.find((i: { id: string }) => i.id === id).status;
    expect([statusOf(a.inventoryId), statusOf(b.inventoryId), statusOf(c.inventoryId)]).toEqual(['IN_STOCK', 'LOW', 'OUT']);

    const low = await request(app).get('/api/v1/seller/inventory').query({ status: 'LOW' }).set(s.auth);
    expect(low.body.data.items.map((i: { id: string }) => i.id)).toEqual([b.inventoryId]);
    const out = await request(app).get('/api/v1/seller/inventory').query({ status: 'OUT' }).set(s.auth);
    expect(out.body.data.items.map((i: { id: string }) => i.id)).toEqual([c.inventoryId]);
    const search = await request(app).get('/api/v1/seller/inventory').query({ q: a.sku.slice(0, 9) }).set(s.auth);
    expect(search.body.data.items.map((i: { id: string }) => i.id)).toEqual([a.inventoryId]);
    const paged = await request(app).get('/api/v1/seller/inventory').query({ pageSize: 2, page: 2 }).set(s.auth);
    expect(paged.body.data.items).toHaveLength(1);
    expect(paged.body.meta).toMatchObject({ total: 3, totalPages: 2 });
  });

  it('lists the ledger newest first with type filters and the acting user\'s name', async () => {
    const s = await makeSeller(app, DOMAIN);
    const p = await product(s, { stock: 10 });
    await op(s, p.inventoryId, 'inward', { quantity: 5 });
    await op(s, p.inventoryId, 'outward', { quantity: 2, reason: 'sample' });

    const res = await request(app).get('/api/v1/seller/stock-movements').query({ inventoryId: p.inventoryId }).set(s.auth);
    expect(res.body.data.items.map((m: { type: string }) => m.type)).toEqual(['OUTWARD', 'INWARD', 'OPENING']);
    expect(res.body.data.items[0]).toMatchObject({ previousQty: 15, changeQty: -2, newQty: 13, by: 'Seller', sku: p.sku });
    const only = await request(app).get('/api/v1/seller/stock-movements').query({ type: 'INWARD' }).set(s.auth);
    expect(only.body.data.items).toHaveLength(1);
    expect((await request(app).get('/api/v1/seller/stock-movements').query({ type: 'BOGUS' }).set(s.auth)).status).toBe(422);
  });

  it('updates the reorder level and moves stock between own warehouses only', async () => {
    const a = await makeSeller(app, DOMAIN);
    const b = await makeSeller(app, DOMAIN);
    const p = await product(a, { stock: 8, reorder: 5 });

    const wh = await request(app).post('/api/v1/seller/warehouses').set(a.auth).send({ name: 'Chennai hub', location: 'Ambattur' });
    expect(wh.status).toBe(201);
    expect((await request(app).post('/api/v1/seller/warehouses').set(a.auth).send({ name: 'chennai HUB' })).status).toBe(409);
    const otherWh = await request(app).post('/api/v1/seller/warehouses').set(b.auth).send({ name: 'Other hub' });

    const set = (body: object) => request(app).patch(`/api/v1/seller/inventory/${p.inventoryId}/settings`).set(a.auth).send(body);
    expect((await set({ reorderLevel: -1 })).status).toBe(422);
    expect((await set({ reorderLevel: 9, warehouseId: otherWh.body.data.warehouse.id })).status).toBe(400);
    expect((await set({ reorderLevel: 9, warehouseId: wh.body.data.warehouse.id })).status).toBe(200);
    expect(await state(p.inventoryId)).toMatchObject({ reorderLevel: 9, warehouseId: wh.body.data.warehouse.id });

    // 8 is now below the new reorder level of 9.
    const low = await request(app).get('/api/v1/seller/inventory').query({ status: 'LOW' }).set(a.auth);
    expect(low.body.data.items[0].warehouse).toMatchObject({ name: 'Chennai hub', location: 'Ambattur' });
    const list = await request(app).get('/api/v1/seller/warehouses').set(a.auth);
    expect(list.body.data.warehouses.find((w: { name: string }) => w.name === 'Chennai hub').skuCount).toBe(1);
  });
});
