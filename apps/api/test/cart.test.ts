import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { computeCart, roundDiv } from '../src/modules/cart/cart.calc.js';
import { SETTING_DEFAULTS, clearSettingsCache } from '../src/modules/settings/settings.service.js';
import { anyCategoryId, cleanupDomain, makeBuyer, makeSeller, publishProduct, uniq } from './helpers.js';

const app = createApp();
const DOMAIN = '@carttest.local';
const rupees = (n: number) => n * 100;

let categoryId: string;
let sellerA: Awaited<ReturnType<typeof makeSeller>>;
let sellerB: Awaited<ReturnType<typeof makeSeller>>;

beforeAll(async () => {
  categoryId = await anyCategoryId();
  sellerA = await makeSeller(app, DOMAIN, { approved: true });
  sellerB = await makeSeller(app, DOMAIN, { approved: true });
  clearSettingsCache();
});

afterAll(async () => {
  await cleanupDomain(DOMAIN);
  await prisma.$disconnect();
});

const cartOf = (b: { auth: object }) => request(app).get('/api/v1/cart').set(b.auth as Record<string, string>);
const add = (b: { auth: object }, variantId: string, quantity = 1) =>
  request(app).post('/api/v1/cart/items').set(b.auth as Record<string, string>).send({ variantId, quantity });

describe('cart arithmetic (pure)', () => {
  const s = { deliveryFeePaise: 4900, freeDeliveryThresholdPaise: 49900, taxRateBp: 1800 };

  it('rounds integer division half up', () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(4, 3)).toBe(1);
    expect(roundDiv(10, 4)).toBe(3);
    expect(roundDiv(0, 7)).toBe(0);
  });

  it('charges delivery per seller and waives it at the threshold', () => {
    const t = computeCart(
      [
        { sellerId: 'A', unitPricePaise: rupees(300), mrpPaise: rupees(400), quantity: 1 }, // below threshold
        { sellerId: 'B', unitPricePaise: rupees(250), mrpPaise: rupees(250), quantity: 2 }, // exactly ₹500 >= ₹499
      ],
      s,
    );
    expect(t.subtotalPaise).toBe(rupees(800));
    expect(t.mrpTotalPaise).toBe(rupees(900));
    expect(t.savingsPaise).toBe(rupees(100));
    expect(t.deliveryPaise).toBe(4900); // only seller A pays
    expect(t.grandTotalPaise).toBe(rupees(800) + 4900);
    expect(t.perSeller.find((p) => p.sellerId === 'A')).toMatchObject({ deliveryPaise: 4900, freeDelivery: false, remainingForFreePaise: 49900 - rupees(300) });
    expect(t.perSeller.find((p) => p.sellerId === 'B')).toMatchObject({ deliveryPaise: 0, freeDelivery: true, remainingForFreePaise: 0 });
    expect(t.itemCount).toBe(3);
  });

  it('extracts the GST already contained in the total without floating-point drift', () => {
    const t = computeCart([{ sellerId: 'A', unitPricePaise: 118000, mrpPaise: 118000, quantity: 1 }], s);
    expect(t.deliveryPaise).toBe(0);
    expect(t.taxIncludedPaise).toBe(18000); // 118000 * 1800 / 11800
    const odd = computeCart([{ sellerId: 'A', unitPricePaise: 99999, mrpPaise: 99999, quantity: 1 }], s);
    expect(Number.isInteger(odd.taxIncludedPaise)).toBe(true);
    expect(odd.taxIncludedPaise).toBe(roundDiv(99999 * 1800, 11800));
  });

  it('handles an empty cart', () => {
    expect(computeCart([], s)).toMatchObject({ itemCount: 0, subtotalPaise: 0, deliveryPaise: 0, grandTotalPaise: 0, taxIncludedPaise: 0 });
  });
});

describe('cart API', () => {
  it('requires a buyer account', async () => {
    const s = await makeSeller(app, DOMAIN);
    expect((await request(app).get('/api/v1/cart')).status).toBe(401);
    expect((await request(app).get('/api/v1/cart').set(s.auth)).status).toBe(403);
    expect((await request(app).post('/api/v1/wishlist/00000000-0000-4000-8000-000000000000').set(s.auth)).status).toBe(403);
  });

  it('adds, merges, updates and removes items, grouping by seller with server-side totals', async () => {
    const buyer = await makeBuyer(app, DOMAIN);
    const p1 = await publishProduct(app, sellerA, categoryId, { name: `Cart A ${uniq()}`, price: 300, mrp: 400 });
    const p2 = await publishProduct(app, sellerB, categoryId, { name: `Cart B ${uniq()}`, price: 700, mrp: 700 });

    expect((await cartOf(buyer)).body.data).toMatchObject({ itemCount: 0, groups: [], canCheckout: false });

    expect((await add(buyer, p1.variants[0]!.id, 2)).status).toBe(201);
    const merged = await add(buyer, p1.variants[0]!.id, 1); // same variant: quantity merges
    expect(merged.body.data.groups[0].items).toHaveLength(1);
    expect(merged.body.data.groups[0].items[0].quantity).toBe(3);

    const both = await add(buyer, p2.variants[0]!.id, 1);
    const d = both.body.data;
    expect(d.groups).toHaveLength(2);
    // A: 3 x 300 = 900 (>= 499, free delivery); B: 700 (free delivery).
    expect(d.totals).toMatchObject({ subtotalPaise: rupees(900 + 700), mrpTotalPaise: rupees(1200 + 700), savingsPaise: rupees(300), deliveryPaise: 0, grandTotalPaise: rupees(1600), itemCount: 4 });
    expect(d.itemCount).toBe(4);
    expect(d.canCheckout).toBe(true);

    const lineId = d.groups.find((g: { items: { productId: string }[] }) => g.items[0]!.productId === p1.id).items[0].id as string;
    const upd = await request(app).patch(`/api/v1/cart/items/${lineId}`).set(buyer.auth).send({ quantity: 1 });
    expect(upd.body.data.totals.subtotalPaise).toBe(rupees(300 + 700));
    // A is now ₹300 < ₹499, so it pays delivery; B still ships free.
    expect(upd.body.data.totals.deliveryPaise).toBe(4900);
    expect(upd.body.data.groups.find((g: { sellerId: string }) => g.sellerId === sellerA.sellerId)).toMatchObject({ deliveryPaise: 4900, freeDelivery: false, remainingForFreePaise: 49900 - rupees(300) });

    const del = await request(app).delete(`/api/v1/cart/items/${lineId}`).set(buyer.auth);
    expect(del.body.data.groups).toHaveLength(1);
    const cleared = await request(app).delete('/api/v1/cart').set(buyer.auth);
    expect(cleared.body.data.itemCount).toBe(0);
  });

  it('never trusts client prices: totals follow the live product price', async () => {
    const buyer = await makeBuyer(app, DOMAIN);
    const p = await publishProduct(app, sellerA, categoryId, { name: `Cart live ${uniq()}`, price: 600, mrp: 800 });
    await add(buyer, p.variants[0]!.id, 1);
    await prisma.product.update({ where: { id: p.id }, data: { pricePaise: rupees(450) } });
    expect((await cartOf(buyer)).body.data.totals.subtotalPaise).toBe(rupees(450));
    // Variant-specific prices win over the product price.
    await prisma.productVariant.update({ where: { id: p.variants[0]!.id }, data: { pricePaise: rupees(425), mrpPaise: rupees(900) } });
    const c = (await cartOf(buyer)).body.data;
    expect(c.groups[0].items[0]).toMatchObject({ unitPricePaise: rupees(425), mrpPaise: rupees(900) });
  });

  it('enforces stock limits and the per-line cap', async () => {
    const buyer = await makeBuyer(app, DOMAIN);
    const scarce = await publishProduct(app, sellerA, categoryId, { name: `Cart scarce ${uniq()}`, stock: 3 });
    const plenty = await publishProduct(app, sellerA, categoryId, { name: `Cart plenty ${uniq()}`, stock: 100 });
    const none = await publishProduct(app, sellerA, categoryId, { name: `Cart none ${uniq()}`, stock: 0 });

    const tooMany = await add(buyer, scarce.variants[0]!.id, 4);
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error).toMatchObject({ message: 'Only 3 left in stock', details: { available: 3, maxQty: 3 } });
    expect((await add(buyer, scarce.variants[0]!.id, 3)).status).toBe(201);
    expect((await add(buyer, scarce.variants[0]!.id, 1)).status).toBe(409); // merging would exceed stock

    expect((await add(buyer, none.variants[0]!.id, 1)).body.error.message).toBe('This item is out of stock');
    expect((await add(buyer, plenty.variants[0]!.id, 11)).status).toBe(422); // schema cap
    expect((await add(buyer, plenty.variants[0]!.id, 10)).status).toBe(201);
    const capped = await add(buyer, plenty.variants[0]!.id, 1);
    expect(capped.status).toBe(409);
    expect(capped.body.error.message).toMatch(/at most 10/);
    expect((await add(buyer, plenty.variants[0]!.id, 0)).status).toBe(422);
  });

  it('flags lines whose stock dropped or that were taken offline, excludes them from totals and blocks checkout', async () => {
    const buyer = await makeBuyer(app, DOMAIN);
    const a = await publishProduct(app, sellerA, categoryId, { name: `Cart issue A ${uniq()}`, price: 600, stock: 10 });
    const b = await publishProduct(app, sellerA, categoryId, { name: `Cart issue B ${uniq()}`, price: 700, stock: 10 });
    await add(buyer, a.variants[0]!.id, 4);
    await add(buyer, b.variants[0]!.id, 1);

    await prisma.inventory.update({ where: { variantId: a.variants[0]!.id }, data: { available: 2 } });
    let c = (await cartOf(buyer)).body.data;
    const lineA = c.groups[0].items.find((i: { productId: string }) => i.productId === a.id);
    expect(lineA).toMatchObject({ issue: 'INSUFFICIENT', available: 2, maxQty: 2 });
    expect(c.totals.subtotalPaise).toBe(rupees(700)); // only the healthy line counts
    expect(c).toMatchObject({ hasIssues: true, canCheckout: false });

    await prisma.inventory.update({ where: { variantId: a.variants[0]!.id }, data: { available: 0 } });
    c = (await cartOf(buyer)).body.data;
    expect(c.groups[0].items.find((i: { productId: string }) => i.productId === a.id).issue).toBe('OUT_OF_STOCK');

    await prisma.product.update({ where: { id: b.id }, data: { approval: 'SUSPENDED' } });
    c = (await cartOf(buyer)).body.data;
    expect(c.groups[0].items.find((i: { productId: string }) => i.productId === b.id).issue).toBe('UNAVAILABLE');
    expect(c.totals.subtotalPaise).toBe(0);
    expect(c.canCheckout).toBe(false);
    expect(c.itemCount).toBe(5); // header badge still counts them
  });

  it('applies the minimum order value', async () => {
    const buyer = await makeBuyer(app, DOMAIN);
    const cheap = await publishProduct(app, sellerA, categoryId, { name: `Cart cheap ${uniq()}`, price: 150, mrp: 150 });
    const res = await add(buyer, cheap.variants[0]!.id, 1);
    expect(res.body.data.totals.subtotalPaise).toBe(rupees(150));
    expect(res.body.data).toMatchObject({ canCheckout: false, minOrderPaise: SETTING_DEFAULTS.minOrderPaise });
    expect((await add(buyer, cheap.variants[0]!.id, 1)).body.data.canCheckout).toBe(true); // ₹300 >= ₹199
  });

  it('rejects unavailable products and isolates carts between buyers', async () => {
    const a = await makeBuyer(app, DOMAIN);
    const b = await makeBuyer(app, DOMAIN);
    const draft = await publishProduct(app, sellerA, categoryId, { name: `Cart draft ${uniq()}`, publish: false });
    expect((await add(a, draft.variants[0]!.id)).status).toBe(404);
    expect((await add(a, '00000000-0000-4000-8000-000000000000')).status).toBe(404);

    const live = await publishProduct(app, sellerA, categoryId, { name: `Cart iso ${uniq()}`, price: 800 });
    const line = (await add(a, live.variants[0]!.id, 2)).body.data.groups[0].items[0].id as string;
    expect((await request(app).patch(`/api/v1/cart/items/${line}`).set(b.auth).send({ quantity: 1 })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/cart/items/${line}`).set(b.auth)).status).toBe(404);
    expect((await cartOf(b)).body.data.itemCount).toBe(0);
    expect((await cartOf(a)).body.data.itemCount).toBe(2);
  });
});

describe('wishlist', () => {
  it('adds idempotently, lists visible products and removes', async () => {
    const buyer = await makeBuyer(app, DOMAIN);
    const p1 = await publishProduct(app, sellerA, categoryId, { name: `Wish one ${uniq()}` });
    const p2 = await publishProduct(app, sellerB, categoryId, { name: `Wish two ${uniq()}` });
    const call = (m: 'post' | 'delete' | 'get', id = '') => request(app)[m](`/api/v1/wishlist${id ? `/${id}` : ''}`).set(buyer.auth);

    expect((await call('get')).body.data).toEqual({ items: [], ids: [] });
    expect((await call('post', p1.id)).status).toBe(201);
    expect((await call('post', p1.id)).body.data.ids).toEqual([p1.id]); // idempotent
    const two = await call('post', p2.id);
    expect(two.body.data.ids).toHaveLength(2);
    expect(two.body.data.items[0]).toMatchObject({ id: p2.id, pricePaise: expect.any(Number) }); // newest first

    // A product that stops being visible drops out of the list.
    await prisma.product.update({ where: { id: p1.id }, data: { approval: 'SUSPENDED' } });
    expect((await call('get')).body.data.ids).toEqual([p2.id]);

    expect((await call('delete', p2.id)).body.data.ids).toEqual([]);
    expect((await call('delete', p2.id)).status).toBe(200); // removing twice is harmless
    expect((await call('post', '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await call('post', p1.id)).status).toBe(404); // not visible any more
  });

  it('keeps wishlists private per buyer', async () => {
    const a = await makeBuyer(app, DOMAIN);
    const b = await makeBuyer(app, DOMAIN);
    const p = await publishProduct(app, sellerA, categoryId, { name: `Wish private ${uniq()}` });
    await request(app).post(`/api/v1/wishlist/${p.id}`).set(a.auth);
    expect((await request(app).get('/api/v1/wishlist').set(b.auth)).body.data.ids).toEqual([]);
  });
});
