import { randomBytes } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PlaceOrderInput, SellerOrderAction } from '@shopsphere/shared-validation';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { pageArgs, pageMeta } from '../../utils/pagination.js';
import { formatINR } from '@shopsphere/shared-config';
import { getCart } from '../cart/cart.service.js';
import { getSettings } from '../settings/settings.service.js';
import {
  loadInventoryContext,
  notifyStockThresholds,
  refNo,
  releaseStock,
  reserveStock,
  commitSale,
  restockReturn,
  type ChangeResult,
  type Tx,
} from '../inventory/inventory.core.js';
import { notify } from '../notifications/notifications.service.js';
import { requireSeller } from '../sellers/require-seller.js';
import {
  CANCELLABLE,
  canTransition,
  couponDiscount,
  deriveOrderStatus,
  returnWindowOpen,
  shipmentTotals,
  type SellerOrderStatus,
} from './orders.calc.js';

/** Cash on delivery is refused above this order value (paise). */
export const COD_MAX_PAISE = 5_000_000;

// ───────────────────────── Coupons & quote ─────────────────────────

async function resolveCoupon(userId: string, code: string, subtotalPaise: number) {
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  const now = new Date();
  if (!coupon || !coupon.active) throw AppError.badRequest('This coupon code is not valid');
  if (coupon.validFrom > now) throw AppError.badRequest('This coupon is not active yet');
  if (coupon.validTo && coupon.validTo < now) throw AppError.badRequest('This coupon has expired');
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw AppError.badRequest('This coupon has reached its usage limit');
  }
  const used = await prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
  if (used > 0) throw AppError.badRequest('You have already used this coupon');
  if (subtotalPaise < coupon.minOrderPaise) {
    throw AppError.badRequest(`Add ${formatINR(coupon.minOrderPaise - subtotalPaise)} more to use ${coupon.code}`);
  }
  return { coupon, discountPaise: couponDiscount(coupon, subtotalPaise) };
}

/** Server-side price/discount/delivery breakdown for the buyer's current cart. */
async function buildQuote(userId: string, couponCode?: string) {
  const [cart, settings] = await Promise.all([getCart(userId), getSettings()]);
  const groups = cart.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.issue) }))
    .filter((g) => g.items.length > 0);
  const subtotal = groups.reduce((n, g) => n + g.subtotalPaise, 0);

  const applied = couponCode ? await resolveCoupon(userId, couponCode, subtotal) : null;
  const discountPaise = applied?.discountPaise ?? 0;
  const shipments = shipmentTotals(
    groups.map((g) => ({ sellerId: g.sellerId, subtotalPaise: g.subtotalPaise, deliveryPaise: g.deliveryPaise })),
    discountPaise,
    settings,
  );
  const sum = (f: (s: (typeof shipments)[number]) => number) => shipments.reduce((n, s) => n + f(s), 0);

  return {
    cart,
    groups,
    shipments,
    settings,
    coupon: applied?.coupon ?? null,
    summary: {
      itemCount: groups.reduce((n, g) => n + g.items.reduce((m, i) => m + i.quantity, 0), 0),
      subtotalPaise: subtotal,
      discountPaise,
      deliveryPaise: sum((s) => s.deliveryPaise),
      taxIncludedPaise: sum((s) => s.taxPaise),
      totalPaise: sum((s) => s.totalPaise),
      savingsPaise: cart.totals.savingsPaise + discountPaise,
      coupon: applied ? { code: applied.coupon.code, discountPaise } : null,
      canCheckout: cart.canCheckout,
      minOrderPaise: settings.minOrderPaise,
      codAvailable: sum((s) => s.totalPaise) <= COD_MAX_PAISE,
      shipments: shipments.map((s) => {
        const g = groups.find((x) => x.sellerId === s.sellerId)!;
        return {
          sellerId: s.sellerId,
          store: g.store,
          itemCount: g.items.reduce((m, i) => m + i.quantity, 0),
          subtotalPaise: s.subtotalPaise,
          discountPaise: s.discountPaise,
          deliveryPaise: s.deliveryPaise,
          totalPaise: s.totalPaise,
        };
      }),
    },
  };
}

export async function quote(userId: string, couponCode?: string) {
  return (await buildQuote(userId, couponCode)).summary;
}

// ───────────────────────── Placing an order ─────────────────────────

const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

export async function placeOrder(userId: string, input: PlaceOrderInput, idempotencyKey?: string) {
  const key = idempotencyKey ? `${userId}:${idempotencyKey}` : null;
  if (key) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
    if (existing) return { order: await getBuyerOrder(userId, existing.id), replayed: true };
  }

  const address = await prisma.address.findFirst({ where: { id: input.addressId, userId, deletedAt: null } });
  if (!address) throw AppError.badRequest('Choose a delivery address');

  const q = await buildQuote(userId, input.couponCode);
  if (!q.summary.canCheckout) {
    throw AppError.conflict('Your cart has items that are unavailable or below the minimum order value. Review your cart first.');
  }
  if (input.expectedTotalPaise !== undefined && input.expectedTotalPaise !== q.summary.totalPaise) {
    throw AppError.conflict('Prices or delivery charges changed since you reviewed your order', { totalPaise: q.summary.totalPaise });
  }
  if (input.paymentMethod === 'COD' && q.summary.totalPaise > COD_MAX_PAISE) {
    throw AppError.badRequest(`Cash on delivery is available up to ${formatINR(COD_MAX_PAISE)}`);
  }
  // Demo gateway: a failed payment never creates an order or touches stock.
  if (input.paymentMethod !== 'COD' && input.demoOutcome === 'FAIL') {
    throw new AppError(402, 'PAYMENT_FAILED', 'The demo payment was declined. Nothing was charged and your cart is unchanged.');
  }

  const orderNo = refNo('SS');
  const prepaid = input.paymentMethod !== 'COD';
  const lines = q.groups.flatMap((g) => g.items.map((i) => ({ ...i, sellerId: g.sellerId })));
  const reserved: ChangeResult[] = [];

  let orderId: string;
  try {
    orderId = await prisma.$transaction(
      async (tx) => {
        if (q.coupon) {
          // The UPDATE takes the coupon row lock, so concurrent orders using it queue up here.
          const claimed = await tx.$queryRaw<{ id: string }[]>`
            UPDATE coupons SET "usedCount" = "usedCount" + 1
             WHERE id = ${q.coupon.id}::uuid AND active
               AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")
            RETURNING id`;
          if (claimed.length === 0) throw AppError.badRequest('This coupon has reached its usage limit');
          const again = await tx.couponUsage.count({ where: { couponId: q.coupon.id, userId } });
          if (again > 0) throw AppError.badRequest('You have already used this coupon');
        }

        const s = q.summary;
        const order = await tx.order.create({
          data: {
            orderNo,
            buyerId: userId,
            addressId: address.id,
            addressSnapshot: {
              name: address.name, phone: address.phone, line1: address.line1, line2: address.line2,
              city: address.city, state: address.state, pincode: address.pincode, label: address.label,
            },
            subtotalPaise: s.subtotalPaise,
            discountPaise: s.discountPaise,
            deliveryPaise: s.deliveryPaise,
            taxPaise: s.taxIncludedPaise,
            totalPaise: s.totalPaise,
            idempotencyKey: key,
            payments: {
              create: {
                method: input.paymentMethod,
                status: prepaid ? 'PAID' : 'PENDING',
                amountPaise: s.totalPaise,
                demoReference: prepaid ? `DEMO-${randomBytes(5).toString('hex').toUpperCase()}` : null,
              },
            },
            sellerOrders: {
              create: q.shipments.map((sh) => {
                const g = q.groups.find((x) => x.sellerId === sh.sellerId)!;
                return {
                  sellerId: sh.sellerId,
                  subtotalPaise: sh.subtotalPaise,
                  discountPaise: sh.discountPaise,
                  deliveryPaise: sh.deliveryPaise,
                  taxPaise: sh.taxPaise,
                  totalPaise: sh.totalPaise,
                  items: {
                    create: g.items.map((i) => ({
                      variantId: i.variantId,
                      productNameSnapshot: i.label && i.label !== 'Default' ? `${i.name} (${i.label})` : i.name,
                      skuSnapshot: i.sku,
                      imageSnapshot: i.image,
                      unitPricePaise: i.unitPricePaise,
                      quantity: i.quantity,
                      lineTotalPaise: i.lineTotalPaise,
                    })),
                  },
                  history: { create: { fromStatus: null, toStatus: 'PLACED', actorId: userId, note: 'Order placed' } },
                  commission: {
                    create: {
                      rateBp: q.settings.commissionBp,
                      amountPaise: sh.commissionPaise,
                      netSellerPaise: sh.netSellerPaise,
                    },
                  },
                };
              }),
            },
            ...(q.coupon
              ? { couponUsage: { create: { couponId: q.coupon.id, userId, discountPaise: s.discountPaise } } }
              : {}),
          },
          select: { id: true },
        });

        // Reserve in a stable order so two orders sharing items cannot deadlock. Any shortfall throws
        // 409 and rolls back the whole order, including reservations already made.
        for (const l of [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
          reserved.push(
            await reserveStock(tx, { variantId: l.variantId, quantity: l.quantity, referenceNo: orderNo, userId }),
          );
        }

        await tx.cartItem.deleteMany({ where: { cart: { userId } } });
        return order.id;
      },
      { timeout: 20_000 },
    );
  } catch (e) {
    if (key && isUniqueViolation(e)) {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
      if (existing) return { order: await getBuyerOrder(userId, existing.id), replayed: true };
    }
    throw e;
  }

  void afterPlaced(orderId, orderNo, userId, reserved).catch(() => undefined);
  return { order: await getBuyerOrder(userId, orderId), replayed: false };
}

/** Best-effort notifications after the order is committed; never fails the request. */
async function afterPlaced(orderId: string, orderNo: string, buyerId: string, reserved: ChangeResult[]) {
  const sellerOrders = await prisma.sellerOrder.findMany({
    where: { orderId },
    select: { totalPaise: true, seller: { select: { userId: true } } },
  });
  await notify({
    userId: buyerId,
    type: 'order.placed',
    title: `Order ${orderNo} placed`,
    body: 'Sellers have been notified. You can track every shipment from your orders.',
    link: `/account/orders/${orderId}`,
  });
  for (const so of sellerOrders) {
    await notify({
      userId: so.seller.userId,
      type: 'order.new',
      title: `New order ${orderNo}`,
      body: `Order value ${formatINR(so.totalPaise)}. Accept it to start fulfilment.`,
      link: '/seller/orders',
    });
  }
  for (const r of reserved) {
    const ctx = await loadInventoryContext(prisma, r.inventoryId);
    await notifyStockThresholds(r, ctx);
  }
}

// ───────────────────────── Read models ─────────────────────────

const sellerOrderInclude = {
  seller: { select: { id: true, businessName: true, gstin: true, store: { select: { name: true, slug: true } } } },
  items: {
    orderBy: { createdAt: 'asc' },
    include: { variant: { select: { product: { select: { id: true, slug: true } } } } },
  },
  history: { orderBy: { createdAt: 'asc' } },
  refunds: true,
  commission: true,
} as const satisfies Prisma.SellerOrderInclude;

const orderInclude = {
  payments: true,
  couponUsage: { include: { coupon: { select: { code: true } } } },
  sellerOrders: { orderBy: { createdAt: 'asc' }, include: sellerOrderInclude },
} as const satisfies Prisma.OrderInclude;

type SellerOrderRow = Prisma.SellerOrderGetPayload<{ include: typeof sellerOrderInclude }>;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const deliveredAtOf = (so: SellerOrderRow) => [...so.history].reverse().find((h) => h.toStatus === 'DELIVERED')?.createdAt ?? null;

function sellerOrderView(so: SellerOrderRow, orderNo: string, index: number) {
  const deliveredAt = so.status === 'DELIVERED' ? deliveredAtOf(so) : null;
  return {
    id: so.id,
    status: so.status as SellerOrderStatus,
    invoiceNo: `INV-${orderNo}-${index + 1}`,
    store: so.seller.store,
    businessName: so.seller.businessName,
    gstin: so.seller.gstin,
    subtotalPaise: so.subtotalPaise,
    discountPaise: so.discountPaise,
    deliveryPaise: so.deliveryPaise,
    taxPaise: so.taxPaise,
    totalPaise: so.totalPaise,
    carrier: so.carrier,
    trackingNo: so.trackingNo,
    cancelReason: so.cancelReason,
    returnStatus: so.returnStatus,
    returnReason: so.returnReason,
    refundedPaise: so.refunds.filter((r) => r.status === 'PROCESSED').reduce((n, r) => n + r.amountPaise, 0),
    canCancel: CANCELLABLE.includes(so.status as SellerOrderStatus),
    canReturn: so.status === 'DELIVERED' && !so.returnStatus && !!deliveredAt && returnWindowOpen(deliveredAt),
    items: so.items.map((i) => ({
      id: i.id,
      name: i.productNameSnapshot,
      sku: i.skuSnapshot,
      image: i.imageSnapshot,
      unitPricePaise: i.unitPricePaise,
      quantity: i.quantity,
      lineTotalPaise: i.lineTotalPaise,
      productId: i.variant?.product.id ?? null,
      slug: i.variant?.product.slug ?? null,
    })),
    timeline: so.history.map((h) => ({ status: h.toStatus, at: h.createdAt, note: h.note })),
  };
}

function orderView(o: OrderRow) {
  const pay = o.payments[0] ?? null;
  return {
    id: o.id,
    orderNo: o.orderNo,
    status: o.status,
    placedAt: o.createdAt,
    address: o.addressSnapshot,
    subtotalPaise: o.subtotalPaise,
    discountPaise: o.discountPaise,
    deliveryPaise: o.deliveryPaise,
    taxPaise: o.taxPaise,
    totalPaise: o.totalPaise,
    coupon: o.couponUsage ? { code: o.couponUsage.coupon.code, discountPaise: o.couponUsage.discountPaise } : null,
    payment: pay ? { method: pay.method, status: pay.status, reference: pay.demoReference, amountPaise: pay.amountPaise } : null,
    shipments: o.sellerOrders.map((so, i) => sellerOrderView(so, o.orderNo, i)),
  };
}

export async function getBuyerOrder(userId: string, orderId: string) {
  // Scoped by buyer: someone else's order id is indistinguishable from a missing one.
  const o = await prisma.order.findFirst({ where: { id: orderId, buyerId: userId }, include: orderInclude });
  if (!o) throw AppError.notFound('Order not found');
  return orderView(o);
}

export async function listBuyerOrders(userId: string, q: { page: number; pageSize: number; filter: string }) {
  const where: Prisma.OrderWhereInput = { buyerId: userId };
  if (q.filter === 'ACTIVE') where.status = { in: ['PLACED', 'CONFIRMED', 'PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED'] };
  if (q.filter === 'DELIVERED') where.status = 'DELIVERED';
  if (q.filter === 'CANCELLED') where.status = 'CANCELLED';
  if (q.filter === 'RETURNS') where.sellerOrders = { some: { status: { in: ['RETURN_REQUESTED', 'RETURNED'] } } };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...pageArgs(q),
      select: {
        id: true, orderNo: true, status: true, createdAt: true, totalPaise: true,
        sellerOrders: { select: { status: true, items: { select: { productNameSnapshot: true, imageSnapshot: true, quantity: true }, take: 6 } } },
      },
    }),
    prisma.order.count({ where }),
  ]);
  return {
    items: rows.map((r) => {
      const items = r.sellerOrders.flatMap((s) => s.items);
      return {
        id: r.id,
        orderNo: r.orderNo,
        status: r.status,
        placedAt: r.createdAt,
        totalPaise: r.totalPaise,
        shipmentCount: r.sellerOrders.length,
        itemCount: items.reduce((n, i) => n + i.quantity, 0),
        preview: items.slice(0, 4).map((i) => ({ name: i.productNameSnapshot, image: i.imageSnapshot })),
      };
    }),
    meta: pageMeta(q, total),
  };
}

// ───────────────────────── Lifecycle engine ─────────────────────────

interface Actor {
  userId: string;
  role: 'BUYER' | 'SELLER';
}

interface MoveOptions {
  carrier?: string;
  trackingNo?: string;
  reason?: string;
  note?: string;
}

const demoTracking = () => `SS${randomBytes(5).toString('hex').toUpperCase()}`;

/**
 * Applies one validated status change to a seller order, together with every consequence
 * (stock, refund, commission, payment status, parent order status), inside the caller's transaction.
 * The status is claimed with a compare-and-set, so a double click or two actors racing cannot
 * release or commit the same stock twice.
 */
async function move(tx: Tx, soId: string, to: SellerOrderStatus, actor: Actor, opt: MoveOptions = {}) {
  const so = await tx.sellerOrder.findUnique({
    where: { id: soId },
    include: { items: true, order: { select: { id: true, orderNo: true, buyerId: true } }, refunds: true },
  });
  if (!so) throw AppError.notFound('Order not found');
  const from = so.status as SellerOrderStatus;
  if (!canTransition(from, to)) throw AppError.conflict(`This order is ${from.toLowerCase().replace('_', ' ')} and cannot move to ${to.toLowerCase().replace('_', ' ')}`);

  const data: Prisma.SellerOrderUpdateManyMutationInput = { status: to };
  if (to === 'CANCELLED') data.cancelReason = opt.reason ?? null;
  if (to === 'SHIPPED') {
    data.carrier = opt.carrier ?? null;
    data.trackingNo = opt.trackingNo || demoTracking();
  }
  if (to === 'RETURN_REQUESTED') {
    data.returnStatus = 'REQUESTED';
    data.returnReason = opt.reason ?? null;
  }
  if (to === 'RETURNED') data.returnStatus = 'RECEIVED';
  if (from === 'RETURN_REQUESTED' && to === 'DELIVERED') data.returnStatus = 'REJECTED';

  const claimed = await tx.sellerOrder.updateMany({ where: { id: soId, status: from }, data });
  if (claimed.count === 0) throw AppError.conflict('This order was just updated. Refresh and try again.');

  const ref = so.order.orderNo;
  const stockCtx = { referenceNo: ref, userId: actor.userId };
  const results: ChangeResult[] = [];

  if (to === 'CANCELLED') {
    for (const i of so.items) if (i.variantId) results.push(await releaseStock(tx, { ...stockCtx, variantId: i.variantId, quantity: i.quantity }));
  }
  if (to === 'SHIPPED') {
    for (const i of so.items) if (i.variantId) await commitSale(tx, { ...stockCtx, variantId: i.variantId, quantity: i.quantity });
  }
  if (to === 'RETURNED') {
    for (const i of so.items) if (i.variantId) await restockReturn(tx, { ...stockCtx, variantId: i.variantId, quantity: i.quantity });
  }

  if (to === 'CANCELLED' || to === 'RETURNED') {
    // Commission is only earned on goods that stay sold.
    await tx.commission.deleteMany({ where: { sellerOrderId: soId, settlementId: null } });
    await refundShipment(tx, so.orderId, so.id, so.totalPaise, to === 'CANCELLED' ? 'Order cancelled' : 'Return received');
  }

  await tx.orderStatusHistory.create({
    data: {
      sellerOrderId: soId,
      fromStatus: from,
      toStatus: to,
      actorId: actor.userId,
      note: opt.note ?? opt.reason ?? null,
    },
  });
  await syncParent(tx, so.orderId);
  return { so, from, results };
}

/** Records a processed demo refund for a shipment when the buyer has actually paid. */
async function refundShipment(tx: Tx, orderId: string, sellerOrderId: string, amountPaise: number, reason: string) {
  const payment = await tx.payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  if (!payment || (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED')) return;
  await tx.refund.create({ data: { paymentId: payment.id, sellerOrderId, amountPaise, reason, status: 'PROCESSED' } });
  const agg = await tx.refund.aggregate({ where: { paymentId: payment.id, status: 'PROCESSED' }, _sum: { amountPaise: true } });
  const refunded = agg._sum.amountPaise ?? 0;
  await tx.payment.update({
    where: { id: payment.id },
    data: { status: refunded >= payment.amountPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
  });
}

/** Re-derives the parent order status from its shipments and settles cash-on-delivery payments. */
async function syncParent(tx: Tx, orderId: string) {
  const children = await tx.sellerOrder.findMany({ where: { orderId }, select: { status: true } });
  const statuses = children.map((c) => c.status as SellerOrderStatus);
  const status = deriveOrderStatus(statuses);
  await tx.order.update({ where: { id: orderId }, data: { status } });

  const payment = await tx.payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  if (payment?.method === 'COD' && payment.status === 'PENDING') {
    const active = statuses.filter((s) => s !== 'CANCELLED');
    if (active.length === 0) await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    else if (active.every((s) => s === 'DELIVERED' || s === 'RETURN_REQUESTED' || s === 'RETURNED')) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID' } });
    }
  }
}

async function afterMove(
  r: Awaited<ReturnType<typeof move>>,
  to: SellerOrderStatus,
  actor: Actor,
  sellerUserId: string,
  reason?: string,
) {
  try {
    const ref = r.so.order.orderNo;
    const buyerLink = `/account/orders/${r.so.order.id}`;
    const toBuyer = (title: string, body?: string) =>
      notify({ userId: r.so.order.buyerId, type: 'order.update', title, body, link: buyerLink });
    const toSeller = (title: string, body?: string) =>
      notify({ userId: sellerUserId, type: 'order.update', title, body, link: '/seller/orders' });

    if (to === 'CANCELLED') {
      if (actor.role === 'SELLER') await toBuyer(`A shipment in ${ref} was cancelled`, reason ? `Reason: ${reason}` : undefined);
      else await toSeller(`Order ${ref} was cancelled by the buyer`, reason ? `Reason: ${reason}` : undefined);
    }
    if (to === 'SHIPPED') await toBuyer(`A shipment in ${ref} is on its way`, 'Open the order to see the carrier and tracking number.');
    if (to === 'DELIVERED' && r.from === 'RETURN_REQUESTED') await toBuyer(`Return rejected for ${ref}`, reason ? `Reason: ${reason}` : undefined);
    else if (to === 'DELIVERED') await toBuyer(`A shipment in ${ref} was delivered`, 'You can now review the products you bought.');
    if (to === 'RETURN_REQUESTED') await toSeller(`Return requested for ${ref}`, reason ? `Reason: ${reason}` : undefined);
    if (to === 'RETURNED') await toBuyer(`Return received for ${ref}`, 'Your refund has been recorded.');
    for (const res of r.results) {
      const ctx = await loadInventoryContext(prisma, res.inventoryId);
      await notifyStockThresholds(res, ctx);
    }
  } catch {
    /* notifications are best-effort */
  }
}

// ───────────────────────── Buyer actions ─────────────────────────

async function ownedShipment(buyerId: string, orderId: string, soId: string) {
  const so = await prisma.sellerOrder.findFirst({
    where: { id: soId, orderId, order: { buyerId } },
    select: { id: true, seller: { select: { userId: true } } },
  });
  if (!so) throw AppError.notFound('Order not found');
  return so;
}

export async function buyerCancelShipment(buyerId: string, orderId: string, soId: string, reason: string) {
  const so = await ownedShipment(buyerId, orderId, soId);
  const actor: Actor = { userId: buyerId, role: 'BUYER' };
  const r = await prisma.$transaction((tx) => move(tx, soId, 'CANCELLED', actor, { reason, note: `Cancelled by buyer: ${reason}` }));
  await afterMove(r, 'CANCELLED', actor, so.seller.userId, reason);
  return getBuyerOrder(buyerId, orderId);
}

/** Cancels every shipment that has not left the warehouse yet. Shipped parts are untouched. */
export async function buyerCancelOrder(buyerId: string, orderId: string, reason: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    select: { sellerOrders: { select: { id: true, status: true, seller: { select: { userId: true } } } } },
  });
  if (!order) throw AppError.notFound('Order not found');
  const targets = order.sellerOrders.filter((s) => CANCELLABLE.includes(s.status as SellerOrderStatus));
  if (targets.length === 0) throw AppError.conflict('Nothing in this order can be cancelled any more');
  const actor: Actor = { userId: buyerId, role: 'BUYER' };
  const results = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const t of targets) out.push(await move(tx, t.id, 'CANCELLED', actor, { reason, note: `Cancelled by buyer: ${reason}` }));
    return out;
  });
  await Promise.all(results.map((r, i) => afterMove(r, 'CANCELLED', actor, targets[i]!.seller.userId, reason)));
  return getBuyerOrder(buyerId, orderId);
}

export async function buyerRequestReturn(buyerId: string, orderId: string, soId: string, reason: string) {
  const so = await ownedShipment(buyerId, orderId, soId);
  const full = await prisma.sellerOrder.findUniqueOrThrow({
    where: { id: soId },
    select: { status: true, returnStatus: true, history: { where: { toStatus: 'DELIVERED' }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (full.status !== 'DELIVERED') throw AppError.conflict('Only delivered items can be returned');
  if (full.returnStatus) throw AppError.conflict('A return was already requested for this shipment');
  const deliveredAt = full.history[0]?.createdAt;
  if (!deliveredAt || !returnWindowOpen(deliveredAt)) throw AppError.conflict('The 7-day return window for this shipment has closed');
  const actor: Actor = { userId: buyerId, role: 'BUYER' };
  const r = await prisma.$transaction((tx) => move(tx, soId, 'RETURN_REQUESTED', actor, { reason, note: `Return requested: ${reason}` }));
  await afterMove(r, 'RETURN_REQUESTED', actor, so.seller.userId, reason);
  return getBuyerOrder(buyerId, orderId);
}

// ───────────────────────── Seller side ─────────────────────────

const SELLER_FILTERS: Record<string, Prisma.SellerOrderWhereInput> = {
  ALL: {},
  NEW: { status: 'PLACED' },
  TO_SHIP: { status: { in: ['ACCEPTED', 'PROCESSING', 'PACKED'] } },
  SHIPPED: { status: 'SHIPPED' },
  DELIVERED: { status: 'DELIVERED' },
  CANCELLED: { status: 'CANCELLED' },
  RETURNS: { status: { in: ['RETURN_REQUESTED', 'RETURNED'] } },
};

export async function listSellerOrders(userId: string, q: { page: number; pageSize: number; filter: string; q?: string }) {
  const seller = await requireSeller(userId);
  const where: Prisma.SellerOrderWhereInput = {
    sellerId: seller.id,
    ...SELLER_FILTERS[q.filter],
    ...(q.q ? { order: { orderNo: { contains: q.q, mode: 'insensitive' } } } : {}),
  };
  const [rows, total, grouped] = await Promise.all([
    prisma.sellerOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...pageArgs(q),
      select: {
        id: true, status: true, totalPaise: true, createdAt: true,
        order: { select: { orderNo: true, addressSnapshot: true, payments: { select: { method: true, status: true }, take: 1 } } },
        items: { select: { productNameSnapshot: true, imageSnapshot: true, quantity: true } },
      },
    }),
    prisma.sellerOrder.count({ where }),
    prisma.sellerOrder.groupBy({ by: ['status'], where: { sellerId: seller.id }, _count: true }),
  ]);
  const n = (...s: string[]) => grouped.filter((g) => s.includes(g.status)).reduce((a, g) => a + g._count, 0);
  return {
    items: rows.map((r) => ({
      id: r.id,
      orderNo: r.order.orderNo,
      status: r.status,
      placedAt: r.createdAt,
      totalPaise: r.totalPaise,
      customer: (r.order.addressSnapshot as { name?: string; city?: string } | null)?.name ?? 'Customer',
      city: (r.order.addressSnapshot as { city?: string } | null)?.city ?? '',
      payment: r.order.payments[0] ?? null,
      itemCount: r.items.reduce((a, i) => a + i.quantity, 0),
      preview: r.items.slice(0, 3).map((i) => ({ name: i.productNameSnapshot, image: i.imageSnapshot })),
    })),
    counts: {
      NEW: n('PLACED'),
      TO_SHIP: n('ACCEPTED', 'PROCESSING', 'PACKED'),
      SHIPPED: n('SHIPPED'),
      DELIVERED: n('DELIVERED'),
      CANCELLED: n('CANCELLED'),
      RETURNS: n('RETURN_REQUESTED', 'RETURNED'),
    },
    meta: pageMeta(q, total),
  };
}

async function sellerShipment(userId: string, soId: string) {
  const seller = await requireSeller(userId);
  const row = await prisma.sellerOrder.findFirst({
    where: { id: soId, sellerId: seller.id },
    include: { ...sellerOrderInclude, order: { include: { payments: true } } },
  });
  if (!row) throw AppError.notFound('Order not found');
  return { seller, row };
}

export async function getSellerOrder(userId: string, soId: string) {
  const { row } = await sellerShipment(userId, soId);
  const siblings = await prisma.sellerOrder.findMany({ where: { orderId: row.orderId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  const index = Math.max(0, siblings.findIndex((s) => s.id === row.id));
  const view = sellerOrderView(row, row.order.orderNo, index);
  const pay = row.order.payments[0];
  const addr = row.order.addressSnapshot as Record<string, string | null>;
  return {
    ...view,
    orderNo: row.order.orderNo,
    placedAt: row.createdAt,
    address: addr,
    payment: pay ? { method: pay.method, status: pay.status } : null,
    commission: row.commission
      ? { rateBp: row.commission.rateBp, amountPaise: row.commission.amountPaise, netSellerPaise: row.commission.netSellerPaise }
      : null,
    // What the seller may do next, so the UI never has to guess the state machine.
    actions: sellerActionsFor(row.status as SellerOrderStatus, row.returnStatus),
  };
}

export function sellerActionsFor(status: SellerOrderStatus, returnStatus: string | null): string[] {
  switch (status) {
    case 'PLACED': return ['accept', 'cancel'];
    case 'ACCEPTED': return ['process', 'cancel'];
    case 'PROCESSING': return ['pack', 'cancel'];
    case 'PACKED': return ['ship', 'cancel'];
    case 'SHIPPED': return ['deliver'];
    case 'RETURN_REQUESTED': return returnStatus === 'APPROVED' ? ['receive_return'] : ['approve_return', 'reject_return'];
    default: return [];
  }
}

const ACTION_TARGET: Partial<Record<SellerOrderAction['action'], SellerOrderStatus>> = {
  accept: 'ACCEPTED',
  process: 'PROCESSING',
  pack: 'PACKED',
  ship: 'SHIPPED',
  deliver: 'DELIVERED',
  cancel: 'CANCELLED',
  reject_return: 'DELIVERED',
  receive_return: 'RETURNED',
};

export async function sellerAct(userId: string, soId: string, a: SellerOrderAction) {
  const { seller, row } = await sellerShipment(userId, soId);
  if (seller.status !== 'APPROVED') throw AppError.forbidden('Your store must be approved before you can fulfil orders');
  const actor: Actor = { userId, role: 'SELLER' };
  const buyerId = row.order.buyerId;
  const orderId = row.orderId;

  if (a.action === 'approve_return') {
    if (row.status !== 'RETURN_REQUESTED' || row.returnStatus !== 'REQUESTED') throw AppError.conflict('There is no pending return to approve');
    await prisma.$transaction(async (tx) => {
      const c = await tx.sellerOrder.updateMany({ where: { id: soId, status: 'RETURN_REQUESTED', returnStatus: 'REQUESTED' }, data: { returnStatus: 'APPROVED' } });
      if (c.count === 0) throw AppError.conflict('This return was just updated. Refresh and try again.');
      await tx.orderStatusHistory.create({
        data: { sellerOrderId: soId, fromStatus: 'RETURN_REQUESTED', toStatus: 'RETURN_REQUESTED', actorId: userId, note: 'Return approved. Send the item back to the seller.' },
      });
    });
    await notify({ userId: buyerId, type: 'order.update', title: `Return approved for ${row.order.orderNo}`, body: 'Send the item back to the seller. Your refund follows once it is received.', link: `/account/orders/${orderId}` }).catch(() => undefined);
    return getSellerOrder(userId, soId);
  }

  if (a.action === 'receive_return' && row.returnStatus !== 'APPROVED') {
    throw AppError.conflict('Approve the return before marking it received');
  }

  const to = ACTION_TARGET[a.action]!;
  const opt: MoveOptions =
    a.action === 'ship' ? { carrier: a.carrier, trackingNo: a.trackingNo, note: `Shipped via ${a.carrier}` }
    : a.action === 'cancel' ? { reason: a.reason, note: `Cancelled by seller: ${a.reason}` }
    : a.action === 'reject_return' ? { reason: a.reason, note: `Return rejected: ${a.reason}` }
    : {};
  const r = await prisma.$transaction((tx) => move(tx, soId, to, actor, opt));
  await afterMove(r, to, actor, userId, 'reason' in a ? a.reason : undefined);
  return getSellerOrder(userId, soId);
}
