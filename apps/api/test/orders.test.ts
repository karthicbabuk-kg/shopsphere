import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { allocate, canTransition, couponDiscount, deriveOrderStatus, shipmentTotals } from '../src/modules/orders/orders.calc.js';
import { clearSettingsCache } from '../src/modules/settings/settings.service.js';
import { anyCategoryId, cleanupDomain, makeBuyer, makeSeller, publishProduct, uniq } from './helpers.js';

const app = createApp();
const DOMAIN = '@orderstest.local';
const rupees = (n: number) => n * 100;

type Auth = { auth: object };
const as = (b: Auth) => b.auth as Record<string, string>;

let categoryId: string;
let sellerA: Awaited<ReturnType<typeof makeSeller>>;
let sellerB: Awaited<ReturnType<typeof makeSeller>>;
const couponCodes: string[] = [];

const addressBody = {
  label: 'Home', name: 'Test Buyer', phone: '9876543210', line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001',
};

beforeAll(async () => {
  categoryId = await anyCategoryId();
  sellerA = await makeSeller(app, DOMAIN, { approved: true });
  sellerB = await makeSeller(app, DOMAIN, { approved: true });
  clearSettingsCache();
});

afterAll(async () => {
  await cleanupDomain(DOMAIN);
  await prisma.coupon.deleteMany({ where: { code: { in: couponCodes } } });
  await prisma.$disconnect();
});

async function buyerWithAddress() {
  const b = await makeBuyer(app, DOMAIN);
  const res = await request(app).post('/api/v1/addresses').set(as(b)).send(addressBody);
  return { ...b, addressId: res.body.data.address.id as string };
}

const product = (seller: typeof sellerA, price: number, stock: number, name = `P ${uniq()}`) =>
  publishProduct(app, seller, categoryId, { name, price, mrp: price + 100, stock });

const addToCart = (b: Auth, variantId: string, quantity = 1) =>
  request(app).post('/api/v1/cart/items').set(as(b)).send({ variantId, quantity });

const place = (b: Auth & { addressId: string }, extra: Record<string, unknown> = {}, key?: string) => {
  const r = request(app).post('/api/v1/orders').set(as(b));
  if (key) r.set('Idempotency-Key', key);
  return r.send({ addressId: b.addressId, paymentMethod: 'UPI', ...extra });
};

const stockOf = (variantId: string) => prisma.inventory.findUniqueOrThrow({ where: { variantId }, select: { available: true, reserved: true, sold: true } });
const act = (seller: typeof sellerA, id: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/seller/orders/${id}/actions`).set(seller.auth).send(body);

describe('order arithmetic (pure)', () => {
  it('allocates a discount without losing a paisa', () => {
    expect(allocate(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([0, 0]);
    expect(allocate(999, [30000, 70000])).toEqual([300, 699]);
  });

  it('computes coupon discounts with min order and cap', () => {
    const pct = { type: 'PERCENT' as const, value: 10, minOrderPaise: rupees(499), maxDiscountPaise: rupees(200) };
    expect(couponDiscount(pct, rupees(498))).toBe(0);
    expect(couponDiscount(pct, rupees(1000))).toBe(rupees(100));
    expect(couponDiscount(pct, rupees(5000))).toBe(rupees(200));
    const flat = { type: 'FLAT' as const, value: rupees(100), minOrderPaise: 0, maxDiscountPaise: null };
    expect(couponDiscount(flat, rupees(60))).toBe(rupees(60)); // never more than the subtotal
  });

  it('shipment totals reconcile to the order total and commission is on goods only', () => {
    const t = shipmentTotals(
      [
        { sellerId: 'A', subtotalPaise: rupees(300), deliveryPaise: 4900 },
        { sellerId: 'B', subtotalPaise: rupees(700), deliveryPaise: 0 },
      ],
      rupees(100),
      { taxRateBp: 1800, commissionBp: 1000 },
    );
    expect(t.map((x) => x.discountPaise)).toEqual([rupees(30), rupees(70)]);
    expect(t[0]!.totalPaise).toBe(rupees(270) + 4900);
    expect(t[0]!.commissionPaise).toBe(rupees(27));
    expect(t[0]!.netSellerPaise).toBe(rupees(243));
    expect(t.reduce((n, x) => n + x.totalPaise, 0)).toBe(rupees(1000) - rupees(100) + 4900);
  });

  it('derives the parent status from shipments', () => {
    expect(deriveOrderStatus(['PLACED', 'PLACED'])).toBe('PLACED');
    expect(deriveOrderStatus(['ACCEPTED', 'PLACED'])).toBe('CONFIRMED');
    expect(deriveOrderStatus(['PACKED', 'PLACED'])).toBe('PROCESSING');
    expect(deriveOrderStatus(['SHIPPED', 'PLACED'])).toBe('PARTIALLY_SHIPPED');
    expect(deriveOrderStatus(['SHIPPED', 'DELIVERED'])).toBe('SHIPPED');
    expect(deriveOrderStatus(['DELIVERED', 'DELIVERED'])).toBe('DELIVERED');
    expect(deriveOrderStatus(['CANCELLED', 'DELIVERED'])).toBe('DELIVERED');
    expect(deriveOrderStatus(['CANCELLED', 'CANCELLED'])).toBe('CANCELLED');
    expect(deriveOrderStatus(['RETURNED', 'CANCELLED'])).toBe('RETURNED');
    expect(deriveOrderStatus(['RETURN_REQUESTED', 'DELIVERED'])).toBe('DELIVERED');
  });

  it('only allows forward transitions', () => {
    expect(canTransition('PLACED', 'ACCEPTED')).toBe(true);
    expect(canTransition('PLACED', 'SHIPPED')).toBe(false);
    expect(canTransition('SHIPPED', 'CANCELLED')).toBe(false);
    expect(canTransition('DELIVERED', 'PLACED')).toBe(false);
    expect(canTransition('CANCELLED', 'ACCEPTED')).toBe(false);
  });
});

describe('addresses', () => {
  it('validates, defaults the first address and isolates buyers', async () => {
    const a = await makeBuyer(app, DOMAIN);
    const bad = await request(app).post('/api/v1/addresses').set(as(a)).send({ ...addressBody, pincode: '12', phone: '123' });
    expect(bad.status).toBe(422);

    const first = await request(app).post('/api/v1/addresses').set(as(a)).send(addressBody);
    expect(first.status).toBe(201);
    expect(first.body.data.address.isDefault).toBe(true);
    const second = await request(app).post('/api/v1/addresses').set(as(a)).send({ ...addressBody, label: 'Work', isDefault: true });
    const list = await request(app).get('/api/v1/addresses').set(as(a));
    expect(list.body.data.items.filter((x: { isDefault: boolean }) => x.isDefault)).toHaveLength(1);
    expect(list.body.data.items[0].id).toBe(second.body.data.address.id);

    const other = await makeBuyer(app, DOMAIN);
    const id = first.body.data.address.id;
    expect((await request(app).patch(`/api/v1/addresses/${id}`).set(as(other)).send(addressBody)).status).toBe(404);
    expect((await request(app).delete(`/api/v1/addresses/${id}`).set(as(other))).status).toBe(404);

    const del = await request(app).delete(`/api/v1/addresses/${second.body.data.address.id}`).set(as(a));
    expect(del.body.data.items).toHaveLength(1);
    expect(del.body.data.items[0].isDefault).toBe(true); // default falls back to the remaining address
  });

  it('is buyer-only', async () => {
    expect((await request(app).get('/api/v1/addresses')).status).toBe(401);
    expect((await request(app).get('/api/v1/addresses').set(sellerA.auth)).status).toBe(403);
  });
});

describe('placing a multi-seller order', () => {
  it('splits into shipments, reserves stock, clears the cart and reconciles money', async () => {
    const b = await buyerWithAddress();
    const pa = await product(sellerA, 300, 5); // below free-delivery threshold
    const pb = await product(sellerB, 700, 5);
    await addToCart(b, pa.variants[0]!.id, 2); // ₹600 → free delivery
    await addToCart(b, pb.variants[0]!.id, 1); // ₹700 → free delivery

    const quote = await request(app).post('/api/v1/checkout/quote').set(as(b)).send({});
    expect(quote.status).toBe(200);
    expect(quote.body.data.totalPaise).toBe(rupees(1300));
    expect(quote.body.data.shipments).toHaveLength(2);

    const res = await place(b, { expectedTotalPaise: quote.body.data.totalPaise });
    expect(res.status).toBe(201);
    const order = res.body.data.order;
    expect(order.orderNo).toMatch(/^SS-\d{8}-[0-9A-F]{6}$/);
    expect(order.status).toBe('PLACED');
    expect(order.shipments).toHaveLength(2);
    expect(order.totalPaise).toBe(rupees(1300));
    expect(order.shipments.reduce((n: number, s: { totalPaise: number }) => n + s.totalPaise, 0)).toBe(order.totalPaise);
    expect(order.payment).toMatchObject({ method: 'UPI', status: 'PAID' });
    expect(order.payment.reference).toMatch(/^DEMO-/);

    expect(await stockOf(pa.variants[0]!.id)).toEqual({ available: 3, reserved: 2, sold: 0 });
    expect(await stockOf(pb.variants[0]!.id)).toEqual({ available: 4, reserved: 1, sold: 0 });
    const cart = await request(app).get('/api/v1/cart').set(as(b));
    expect(cart.body.data.itemCount).toBe(0);

    const commissions = await prisma.commission.findMany({ where: { sellerOrder: { orderId: order.id } } });
    expect(commissions).toHaveLength(2);
    expect(commissions.reduce((n, c) => n + c.amountPaise, 0)).toBe(rupees(130)); // 10% of ₹1,300

    const ledger = await prisma.stockMovement.findMany({ where: { referenceNo: order.orderNo } });
    expect(ledger.every((m) => m.type === 'RESERVE')).toBe(true);
    expect(ledger).toHaveLength(2);

    // Each seller sees only their own shipment.
    const mineA = await request(app).get('/api/v1/seller/orders').set(sellerA.auth);
    expect(mineA.body.data.items.some((o: { orderNo: string }) => o.orderNo === order.orderNo)).toBe(true);
  });

  it('is idempotent: the same key never creates or reserves twice', async () => {
    const b = await buyerWithAddress();
    const p = await product(sellerA, 500, 5);
    await addToCart(b, p.variants[0]!.id, 1);
    const key = `idem-${uniq()}`;
    const first = await place(b, {}, key);
    expect(first.status).toBe(201);
    // The cart is now empty; a replay must return the original order, not fail or duplicate.
    const second = await place(b, {}, key);
    expect(second.status).toBe(200);
    expect(second.body.data.replayed).toBe(true);
    expect(second.body.data.order.id).toBe(first.body.data.order.id);
    expect((await stockOf(p.variants[0]!.id)).reserved).toBe(1);
    // A different buyer reusing the key gets their own order, not someone else's.
    const other = await buyerWithAddress();
    await addToCart(other, p.variants[0]!.id, 1);
    const third = await place(other, {}, key);
    expect(third.status).toBe(201);
    expect(third.body.data.order.id).not.toBe(first.body.data.order.id);
  });

  it('applies a coupon once per buyer and spreads the discount across shipments', async () => {
    const code = `T${uniq()}`.toUpperCase();
    couponCodes.push(code);
    await prisma.coupon.create({ data: { code, type: 'PERCENT', value: 10, minOrderPaise: rupees(500), maxDiscountPaise: rupees(500), usageLimit: 1 } });
    const b = await buyerWithAddress();
    const pa = await product(sellerA, 300, 5);
    const pb = await product(sellerB, 700, 5);
    await addToCart(b, pa.variants[0]!.id, 1);
    await addToCart(b, pb.variants[0]!.id, 1);

    const bad = await request(app).post('/api/v1/checkout/quote').set(as(b)).send({ couponCode: 'NOPE123' });
    expect(bad.status).toBe(400);

    const q = await request(app).post('/api/v1/checkout/quote').set(as(b)).send({ couponCode: code.toLowerCase() });
    expect(q.status).toBe(200);
    expect(q.body.data.discountPaise).toBe(rupees(100));
    // ₹300 + ₹49 delivery (below threshold) and ₹700 free → 1000 - 100 + 49
    expect(q.body.data.totalPaise).toBe(rupees(1000) - rupees(100) + 4900);

    const res = await place(b, { couponCode: code });
    expect(res.status).toBe(201);
    const o = res.body.data.order;
    expect(o.discountPaise).toBe(rupees(100));
    expect(o.coupon.code).toBe(code);
    expect(o.shipments.map((s: { discountPaise: number }) => s.discountPaise).sort((a: number, c: number) => a - c)).toEqual([rupees(30), rupees(70)]);
    expect(o.shipments.reduce((n: number, s: { totalPaise: number }) => n + s.totalPaise, 0)).toBe(o.totalPaise);

    // Usage limit reached: a second buyer cannot use it.
    const c = await buyerWithAddress();
    await addToCart(c, pa.variants[0]!.id, 1);
    await addToCart(c, pb.variants[0]!.id, 1);
    const again = await request(app).post('/api/v1/checkout/quote').set(as(c)).send({ couponCode: code });
    expect(again.status).toBe(400);
    expect(again.body.error.message).toMatch(/usage limit/i);
  });

  it('refuses stale prices, declined demo payments and carts below the minimum', async () => {
    const b = await buyerWithAddress();
    const p = await product(sellerA, 400, 5);
    await addToCart(b, p.variants[0]!.id, 1);

    const stale = await place(b, { expectedTotalPaise: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.totalPaise).toBe(rupees(400) + 4900);

    const declined = await place(b, { demoOutcome: 'FAIL' });
    expect(declined.status).toBe(402);
    expect(declined.body.error.code).toBe('PAYMENT_FAILED');
    expect(await stockOf(p.variants[0]!.id)).toEqual({ available: 5, reserved: 0, sold: 0 });
    expect((await request(app).get('/api/v1/cart').set(as(b))).body.data.itemCount).toBe(1);

    const cheap = await product(sellerA, 100, 5);
    const b2 = await buyerWithAddress();
    await addToCart(b2, cheap.variants[0]!.id, 1);
    expect((await place(b2)).status).toBe(409); // below the ₹199 minimum

    const noAddress = await place({ ...b, addressId: '00000000-0000-4000-8000-000000000000' });
    expect(noAddress.status).toBe(400);
  });

  it('cannot oversell: two buyers racing for the last unit', async () => {
    const p = await product(sellerA, 500, 1);
    const b1 = await buyerWithAddress();
    const b2 = await buyerWithAddress();
    await addToCart(b1, p.variants[0]!.id, 1);
    await addToCart(b2, p.variants[0]!.id, 1);
    const [r1, r2] = await Promise.all([place(b1), place(b2)]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(await stockOf(p.variants[0]!.id)).toEqual({ available: 0, reserved: 1, sold: 0 });
    // The loser left no order behind.
    const loser = r1.status === 409 ? b1 : b2;
    expect((await request(app).get('/api/v1/orders').set(as(loser))).body.data.items).toHaveLength(0);
  });

  it('rolls the whole order back when one line cannot be reserved', async () => {
    const p1 = await product(sellerA, 500, 5);
    const p2 = await product(sellerB, 500, 1);
    const b = await buyerWithAddress();
    await addToCart(b, p1.variants[0]!.id, 2);
    await addToCart(b, p2.variants[0]!.id, 1);
    // Someone else buys the last unit of p2 after the cart was built.
    await prisma.inventory.update({ where: { variantId: p2.variants[0]!.id }, data: { available: 0 } });
    const res = await place(b);
    expect(res.status).toBe(409);
    expect(await stockOf(p1.variants[0]!.id)).toEqual({ available: 5, reserved: 0, sold: 0 });
  });

  it('requires a buyer', async () => {
    expect((await request(app).post('/api/v1/orders').send({})).status).toBe(401);
    expect((await request(app).post('/api/v1/orders').set(sellerA.auth).send({})).status).toBe(403);
  });
});

describe('buyer cancellation', () => {
  it('releases stock and refunds a prepaid shipment; shipped parts stay', async () => {
    const b = await buyerWithAddress();
    const pa = await product(sellerA, 600, 5);
    const pb = await product(sellerB, 600, 5);
    await addToCart(b, pa.variants[0]!.id, 1);
    await addToCart(b, pb.variants[0]!.id, 1);
    const order = (await place(b)).body.data.order;
    const [sa, sb] = order.shipments;

    // Find which shipment belongs to seller A, then ship it.
    const listA = await request(app).get('/api/v1/seller/orders').set(sellerA.auth);
    const idA = listA.body.data.items.find((o: { orderNo: string }) => o.orderNo === order.orderNo).id as string;
    for (const a of [{ action: 'accept' }, { action: 'process' }, { action: 'pack' }, { action: 'ship', carrier: 'Delhivery' }]) {
      expect((await act(sellerA, idA, a)).status).toBe(200);
    }
    expect(await stockOf(pa.variants[0]!.id)).toEqual({ available: 4, reserved: 0, sold: 1 });

    // Cancelling the shipped shipment is refused.
    const shippedId = [sa, sb].find((s) => s.id === idA).id;
    const nope = await request(app).post(`/api/v1/orders/${order.id}/shipments/${shippedId}/cancel`).set(as(b)).send({ reason: 'Changed my mind' });
    expect(nope.status).toBe(409);

    // Whole-order cancel only cancels what has not shipped.
    const res = await request(app).post(`/api/v1/orders/${order.id}/cancel`).set(as(b)).send({ reason: 'Changed my mind' });
    expect(res.status).toBe(200);
    const after = res.body.data.order;
    expect(after.status).toBe('SHIPPED'); // only the shipped shipment remains active
    expect(after.shipments.map((s: { status: string }) => s.status).sort()).toEqual(['CANCELLED', 'SHIPPED']);
    expect(await stockOf(pb.variants[0]!.id)).toEqual({ available: 5, reserved: 0, sold: 0 });
    expect(after.payment.status).toBe('PARTIALLY_REFUNDED');
    const cancelled = after.shipments.find((s: { status: string }) => s.status === 'CANCELLED');
    expect(cancelled.refundedPaise).toBe(cancelled.totalPaise);
    expect(await prisma.commission.count({ where: { sellerOrderId: cancelled.id } })).toBe(0);

    // A second cancel finds nothing cancellable.
    expect((await request(app).post(`/api/v1/orders/${order.id}/cancel`).set(as(b)).send({ reason: 'Again please' })).status).toBe(409);
    // Another buyer cannot touch it.
    const other = await buyerWithAddress();
    expect((await request(app).post(`/api/v1/orders/${order.id}/cancel`).set(as(other)).send({ reason: 'Not mine' })).status).toBe(404);
    expect((await request(app).get(`/api/v1/orders/${order.id}`).set(as(other))).status).toBe(404);
  });

  it('cancelling everything cancels the order; COD is never charged', async () => {
    const b = await buyerWithAddress();
    const p = await product(sellerA, 600, 5);
    await addToCart(b, p.variants[0]!.id, 2);
    const order = (await place(b, { paymentMethod: 'COD' })).body.data.order;
    expect(order.payment).toMatchObject({ method: 'COD', status: 'PENDING' });
    const res = await request(app).post(`/api/v1/orders/${order.id}/cancel`).set(as(b)).send({ reason: 'Ordered by mistake' });
    expect(res.body.data.order.status).toBe('CANCELLED');
    expect(res.body.data.order.payment.status).toBe('FAILED');
    expect(await stockOf(p.variants[0]!.id)).toEqual({ available: 5, reserved: 0, sold: 0 });
    const ledger = await prisma.stockMovement.findMany({ where: { referenceNo: order.orderNo }, orderBy: { createdAt: 'asc' } });
    expect(ledger.map((m) => m.type)).toEqual(['RESERVE', 'RELEASE']);
  });
});

describe('seller fulfilment, delivery, returns and reviews', () => {
  it('walks the full lifecycle with state-machine and ownership checks', async () => {
    const b = await buyerWithAddress();
    const p = await product(sellerA, 800, 5);
    await addToCart(b, p.variants[0]!.id, 2);
    const order = (await place(b, { paymentMethod: 'COD' })).body.data.order;
    const sid = order.shipments[0].id as string;

    // Ownership: another seller cannot see or act on it.
    expect((await request(app).get(`/api/v1/seller/orders/${sid}`).set(sellerB.auth)).status).toBe(404);
    expect((await act(sellerB, sid, { action: 'accept' })).status).toBe(404);
    // Validation and the state machine.
    expect((await act(sellerA, sid, { action: 'ship', carrier: 'Delhivery' })).status).toBe(409);
    expect((await act(sellerA, sid, { action: 'ship' })).status).toBe(422);
    expect((await act(sellerA, sid, { action: 'cancel' })).status).toBe(422);

    const accepted = await act(sellerA, sid, { action: 'accept' });
    expect(accepted.body.data.order.actions).toEqual(['process', 'cancel']);
    expect((await act(sellerA, sid, { action: 'accept' })).status).toBe(409); // double click
    await act(sellerA, sid, { action: 'process' });
    await act(sellerA, sid, { action: 'pack' });
    expect((await request(app).get(`/api/v1/orders/${order.id}`).set(as(b))).body.data.order.status).toBe('PROCESSING');

    const shipped = await act(sellerA, sid, { action: 'ship', carrier: 'Blue Dart', trackingNo: 'BD12345' });
    expect(shipped.body.data.order).toMatchObject({ status: 'SHIPPED', carrier: 'Blue Dart', trackingNo: 'BD12345' });
    expect(await stockOf(p.variants[0]!.id)).toEqual({ available: 3, reserved: 0, sold: 2 });

    // Not yet delivered: no review, no return.
    expect((await request(app).get(`/api/v1/reviews/mine/${p.id}`).set(as(b))).body.data.eligible).toBe(false);
    expect((await request(app).put(`/api/v1/reviews/${p.id}`).set(as(b)).send({ rating: 5 })).status).toBe(403);
    expect((await request(app).post(`/api/v1/orders/${order.id}/shipments/${sid}/return`).set(as(b)).send({ reason: 'Too early' })).status).toBe(409);

    const delivered = await act(sellerA, sid, { action: 'deliver' });
    expect(delivered.body.data.order.status).toBe('DELIVERED');
    const view = (await request(app).get(`/api/v1/orders/${order.id}`).set(as(b))).body.data.order;
    expect(view.status).toBe('DELIVERED');
    expect(view.payment.status).toBe('PAID'); // cash collected on delivery
    expect(view.shipments[0].canReturn).toBe(true);
    expect(view.shipments[0].timeline.map((t: { status: string }) => t.status)).toEqual(['PLACED', 'ACCEPTED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED']);

    // Reviews: now allowed, one per product, rating recalculated.
    expect((await request(app).get(`/api/v1/reviews/mine/${p.id}`).set(as(b))).body.data.eligible).toBe(true);
    expect((await request(app).put(`/api/v1/reviews/${p.id}`).set(as(b)).send({ rating: 9 })).status).toBe(422);
    expect((await request(app).put(`/api/v1/reviews/${p.id}`).set(as(b)).send({ rating: 4, title: 'Solid', body: 'Works well.' })).status).toBe(200);
    await request(app).put(`/api/v1/reviews/${p.id}`).set(as(b)).send({ rating: 5, title: 'Even better' });
    const prod = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, select: { ratingAvg: true, ratingCount: true } });
    expect(prod.ratingCount).toBe(1);
    expect(Number(prod.ratingAvg)).toBe(5);
    const stranger = await buyerWithAddress();
    expect((await request(app).put(`/api/v1/reviews/${p.id}`).set(as(stranger)).send({ rating: 1 })).status).toBe(403);

    // Return: request → seller must approve before receiving → stock back, refund, commission gone.
    const ret = await request(app).post(`/api/v1/orders/${order.id}/shipments/${sid}/return`).set(as(b)).send({ reason: 'Not as described' });
    expect(ret.status).toBe(200);
    expect(ret.body.data.order.shipments[0]).toMatchObject({ status: 'RETURN_REQUESTED', returnStatus: 'REQUESTED' });
    expect((await request(app).post(`/api/v1/orders/${order.id}/shipments/${sid}/return`).set(as(b)).send({ reason: 'Twice' })).status).toBe(409);
    expect((await act(sellerA, sid, { action: 'receive_return' })).status).toBe(409); // not approved yet
    await act(sellerA, sid, { action: 'approve_return' });
    const received = await act(sellerA, sid, { action: 'receive_return' });
    expect(received.body.data.order.status).toBe('RETURNED');
    expect(await stockOf(p.variants[0]!.id)).toEqual({ available: 5, reserved: 0, sold: 0 });
    const final = (await request(app).get(`/api/v1/orders/${order.id}`).set(as(b))).body.data.order;
    expect(final.status).toBe('RETURNED');
    expect(final.payment.status).toBe('REFUNDED');
    expect(final.shipments[0].refundedPaise).toBe(final.shipments[0].totalPaise);
    expect(await prisma.commission.count({ where: { sellerOrderId: sid } })).toBe(0);
    const types = (await prisma.stockMovement.findMany({ where: { referenceNo: order.orderNo }, orderBy: { createdAt: 'asc' } })).map((m) => m.type);
    expect(types).toEqual(['RESERVE', 'SALE', 'RETURN_RESTOCK']);
  });

  it('a rejected return goes back to delivered and cannot be re-requested', async () => {
    const b = await buyerWithAddress();
    const p = await product(sellerA, 800, 5);
    await addToCart(b, p.variants[0]!.id, 1);
    const order = (await place(b)).body.data.order;
    const sid = order.shipments[0].id as string;
    for (const a of [{ action: 'accept' }, { action: 'process' }, { action: 'pack' }, { action: 'ship', carrier: 'DTDC' }, { action: 'deliver' }]) await act(sellerA, sid, a);
    await request(app).post(`/api/v1/orders/${order.id}/shipments/${sid}/return`).set(as(b)).send({ reason: 'Changed my mind' });
    const rej = await act(sellerA, sid, { action: 'reject_return', reason: 'Item was used' });
    expect(rej.body.data.order).toMatchObject({ status: 'DELIVERED', returnStatus: 'REJECTED' });
    expect((await request(app).post(`/api/v1/orders/${order.id}/shipments/${sid}/return`).set(as(b)).send({ reason: 'Please' })).status).toBe(409);
    expect(await stockOf(p.variants[0]!.id)).toEqual({ available: 4, reserved: 0, sold: 1 });
  });

  it('refuses returns after the 7-day window', async () => {
    const b = await buyerWithAddress();
    const p = await product(sellerA, 800, 5);
    await addToCart(b, p.variants[0]!.id, 1);
    const order = (await place(b)).body.data.order;
    const sid = order.shipments[0].id as string;
    for (const a of [{ action: 'accept' }, { action: 'process' }, { action: 'pack' }, { action: 'ship', carrier: 'DTDC' }, { action: 'deliver' }]) await act(sellerA, sid, a);
    await prisma.orderStatusHistory.updateMany({
      where: { sellerOrderId: sid, toStatus: 'DELIVERED' },
      data: { createdAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) },
    });
    const res = await request(app).post(`/api/v1/orders/${order.id}/shipments/${sid}/return`).set(as(b)).send({ reason: 'Too late' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/window/i);
  });

  it('lists seller orders with counts, filters and search', async () => {
    const res = await request(app).get('/api/v1/seller/orders?filter=DELIVERED').set(sellerA.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.items.every((o: { status: string }) => o.status === 'DELIVERED')).toBe(true);
    expect(res.body.data.counts).toHaveProperty('NEW');
    const none = await request(app).get('/api/v1/seller/orders?q=ZZZ-NOT-AN-ORDER').set(sellerA.auth);
    expect(none.body.data.items).toHaveLength(0);
    expect((await request(app).get('/api/v1/seller/orders').set(as(await makeBuyer(app, DOMAIN)))).status).toBe(403);
  });
});
