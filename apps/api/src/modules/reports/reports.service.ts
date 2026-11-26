import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { rupees, toCsv } from '../../utils/csv.js';
import { audit } from '../../utils/audit.js';
import { clearSettingsCache, getSettings, SETTING_DEFAULTS } from '../settings/settings.service.js';
import { notify } from '../notifications/notifications.service.js';
import { requireSeller } from '../sellers/require-seller.js';
import type { SettingsInput } from '@shopsphere/shared-validation';

/**
 * Definitions used by every number on the dashboards (documented in docs/BUSINESS_LOGIC.md):
 *  - Sales: sum of shipment totals (goods after discount + delivery) for shipments that are not
 *    CANCELLED or RETURNED, counted on the day the order was placed (India time).
 *  - Commission / net: rows in `commissions`, which only exist for shipments that stayed sold, so
 *    goods value = commission + net and sales = commission + net + delivery.
 */
const COUNTED = { notIn: ['CANCELLED', 'RETURNED'] as ('CANCELLED' | 'RETURNED')[] };
const IST_MS = 5.5 * 3600 * 1000;
const DAY_MS = 86_400_000;

function window(days: number) {
  const todayIst = Date.now() + IST_MS;
  const keys = Array.from({ length: days }, (_, i) => new Date(todayIst - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10));
  return { keys, since: new Date(`${keys[0]}T00:00:00+05:30`) };
}

type SoWhere = Prisma.SellerOrderWhereInput;
const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

async function core(days: number, sellerId?: string) {
  const { keys, since } = window(days);
  const base: SoWhere = { createdAt: { gte: since }, ...(sellerId ? { sellerId } : {}) };
  const counted: SoWhere = { ...base, status: COUNTED };
  const sellerSql = sellerId ? Prisma.sql`AND so."sellerId" = ${sellerId}::uuid` : Prisma.empty;

  const [agg, units, comm, statuses, seriesRows, topItems] = await Promise.all([
    prisma.sellerOrder.aggregate({ where: counted, _sum: { totalPaise: true, deliveryPaise: true, discountPaise: true }, _count: true }),
    prisma.orderItem.aggregate({ where: { sellerOrder: counted }, _sum: { quantity: true } }),
    prisma.commission.aggregate({ where: { sellerOrder: counted }, _sum: { amountPaise: true, netSellerPaise: true } }),
    prisma.sellerOrder.groupBy({ by: ['status'], where: base, _count: true }),
    prisma.$queryRaw<{ d: string; sales: bigint; orders: number }[]>`
      SELECT to_char(date_trunc('day', so."createdAt" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS d,
             SUM(so."totalPaise")::bigint AS sales, COUNT(*)::int AS orders
        FROM seller_orders so
       WHERE so."createdAt" >= ${since} AND so.status NOT IN ('CANCELLED', 'RETURNED') ${sellerSql}
       GROUP BY 1`,
    prisma.orderItem.groupBy({
      by: ['productNameSnapshot'],
      where: { sellerOrder: counted },
      _sum: { quantity: true, lineTotalPaise: true },
      orderBy: { _sum: { lineTotalPaise: 'desc' } },
      take: 5,
    }),
  ]);

  const byDay = new Map(seriesRows.map((r) => [r.d, r]));
  const orders = agg._count;
  const sales = agg._sum.totalPaise ?? 0;
  return {
    days,
    since,
    counted,
    kpis: {
      salesPaise: sales,
      orders,
      units: units._sum.quantity ?? 0,
      avgOrderPaise: orders ? Math.round(sales / orders) : 0,
      deliveryPaise: agg._sum.deliveryPaise ?? 0,
      discountPaise: agg._sum.discountPaise ?? 0,
      commissionPaise: comm._sum.amountPaise ?? 0,
      netToSellersPaise: comm._sum.netSellerPaise ?? 0,
      cancelled: statuses.find((s) => s.status === 'CANCELLED')?._count ?? 0,
      returned: statuses.filter((s) => s.status === 'RETURNED' || s.status === 'RETURN_REQUESTED').reduce((n, s) => n + s._count, 0),
    },
    series: keys.map((d) => ({ date: d, salesPaise: num(byDay.get(d)?.sales), orders: byDay.get(d)?.orders ?? 0 })),
    statusBreakdown: statuses.map((s) => ({ status: s.status, count: s._count })).sort((a, b) => b.count - a.count),
    topItems: topItems.map((t) => ({ name: t.productNameSnapshot, units: t._sum.quantity ?? 0, salesPaise: t._sum.lineTotalPaise ?? 0 })),
  };
}

// ───────────────────────── Seller ─────────────────────────

export async function sellerReport(userId: string, days: number) {
  const seller = await requireSeller(userId);
  const r = await core(days, seller.id);
  const [pendingFulfilment, unsettled, settlements] = await Promise.all([
    prisma.sellerOrder.count({ where: { sellerId: seller.id, status: { in: ['PLACED', 'ACCEPTED', 'PROCESSING', 'PACKED'] } } }),
    prisma.commission.aggregate({ where: { settlementId: null, sellerOrder: { sellerId: seller.id, status: 'DELIVERED' } }, _sum: { netSellerPaise: true } }),
    prisma.sellerSettlement.groupBy({ by: ['status'], where: { sellerId: seller.id }, _sum: { netPaise: true } }),
  ]);
  const settled = (s: string) => settlements.find((x) => x.status === s)?._sum.netPaise ?? 0;
  return {
    days: r.days,
    kpis: { ...r.kpis, pendingFulfilment },
    series: r.series,
    statusBreakdown: r.statusBreakdown,
    topItems: r.topItems,
    payouts: {
      readyToSettlePaise: unsettled._sum.netSellerPaise ?? 0,
      inPendingSettlementPaise: settled('PENDING'),
      paidPaise: settled('PAID'),
    },
  };
}

export async function sellerOrdersCsv(userId: string, days: number) {
  const seller = await requireSeller(userId);
  const { since } = window(days);
  const rows = await prisma.sellerOrder.findMany({
    where: { sellerId: seller.id, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 10_000,
    select: {
      status: true, subtotalPaise: true, discountPaise: true, deliveryPaise: true, totalPaise: true, createdAt: true, carrier: true, trackingNo: true,
      order: { select: { orderNo: true, addressSnapshot: true, payments: { select: { method: true, status: true }, take: 1 } } },
      items: { select: { quantity: true } },
      commission: { select: { amountPaise: true, netSellerPaise: true } },
    },
  });
  return toCsv(
    ['Order no', 'Placed at (UTC)', 'Status', 'Customer', 'City', 'Units', 'Payment', 'Payment status', 'Items (INR)', 'Discount (INR)', 'Delivery (INR)', 'Total (INR)', 'Platform fee (INR)', 'Your earnings (INR)', 'Carrier', 'Tracking'],
    rows.map((r) => {
      const a = r.order.addressSnapshot as { name?: string; city?: string } | null;
      return [
        r.order.orderNo, r.createdAt.toISOString(), r.status, a?.name, a?.city, r.items.reduce((n, i) => n + i.quantity, 0),
        r.order.payments[0]?.method, r.order.payments[0]?.status,
        rupees(r.subtotalPaise), rupees(r.discountPaise), rupees(r.deliveryPaise), rupees(r.totalPaise),
        r.commission ? rupees(r.commission.amountPaise) : '', r.commission ? rupees(r.commission.netSellerPaise) : '',
        r.carrier, r.trackingNo,
      ];
    }),
  );
}

export async function sellerSettlements(userId: string) {
  const seller = await requireSeller(userId);
  return prisma.sellerSettlement.findMany({
    where: { sellerId: seller.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, periodStart: true, periodEnd: true, grossPaise: true, commissionPaise: true, netPaise: true, status: true, createdAt: true, _count: { select: { commissions: true } } },
  });
}

// ───────────────────────── Admin ─────────────────────────

export async function adminReport(days: number) {
  const r = await core(days);
  const [topSellerRows, categories, buyers, activeSellers, invTotals, low, out, valuation] = await Promise.all([
    prisma.sellerOrder.groupBy({ by: ['sellerId'], where: r.counted, _sum: { totalPaise: true }, _count: true, orderBy: { _sum: { totalPaise: 'desc' } }, take: 5 }),
    prisma.$queryRaw<{ name: string; sales: bigint; units: bigint }[]>`
      SELECT c.name, SUM(oi."lineTotalPaise")::bigint AS sales, SUM(oi.quantity)::bigint AS units
        FROM order_items oi
        JOIN seller_orders so ON so.id = oi."sellerOrderId"
        JOIN product_variants v ON v.id = oi."variantId"
        JOIN products p ON p.id = v."productId"
        JOIN categories c ON c.id = p."categoryId"
       WHERE so."createdAt" >= ${r.since} AND so.status NOT IN ('CANCELLED', 'RETURNED')
       GROUP BY c.name ORDER BY sales DESC LIMIT 6`,
    prisma.user.count({ where: { role: 'BUYER', deletedAt: null, createdAt: { gte: r.since } } }),
    prisma.seller.count({ where: { status: 'APPROVED', deletedAt: null } }),
    prisma.inventory.aggregate({ _sum: { available: true, reserved: true, sold: true } }),
    prisma.inventory.count({ where: { available: { gt: 0, lte: prisma.inventory.fields.reorderLevel } } }),
    prisma.inventory.count({ where: { available: 0 } }),
    prisma.$queryRaw<{ value: bigint }[]>`
      SELECT COALESCE(SUM(i.available::bigint * COALESCE(v."pricePaise", p."pricePaise")), 0) AS value
        FROM inventories i JOIN product_variants v ON v.id = i."variantId" JOIN products p ON p.id = v."productId"
       WHERE v."deletedAt" IS NULL AND p."deletedAt" IS NULL AND p.status <> 'ARCHIVED'`,
  ]);
  const sellers = await prisma.seller.findMany({
    where: { id: { in: topSellerRows.map((s) => s.sellerId) } },
    select: { id: true, businessName: true, store: { select: { name: true } } },
  });
  const commissions = await prisma.commission.groupBy({
    by: ['sellerOrderId'],
    where: { sellerOrder: { ...r.counted, sellerId: { in: topSellerRows.map((s) => s.sellerId) } } },
    _sum: { amountPaise: true },
  });
  const so = await prisma.sellerOrder.findMany({ where: { id: { in: commissions.map((c) => c.sellerOrderId) } }, select: { id: true, sellerId: true } });
  const commBySeller = new Map<string, number>();
  for (const c of commissions) {
    const sid = so.find((x) => x.id === c.sellerOrderId)?.sellerId;
    if (sid) commBySeller.set(sid, (commBySeller.get(sid) ?? 0) + (c._sum.amountPaise ?? 0));
  }
  return {
    days: r.days,
    kpis: { ...r.kpis, newBuyers: buyers, activeSellers },
    series: r.series,
    statusBreakdown: r.statusBreakdown,
    topItems: r.topItems,
    topSellers: topSellerRows.map((t) => {
      const s = sellers.find((x) => x.id === t.sellerId);
      return { sellerId: t.sellerId, name: s?.store?.name ?? s?.businessName ?? 'Seller', salesPaise: t._sum.totalPaise ?? 0, orders: t._count, commissionPaise: commBySeller.get(t.sellerId) ?? 0 };
    }),
    categories: categories.map((c) => ({ name: c.name, salesPaise: num(c.sales), units: num(c.units) })),
    inventory: {
      unitsAvailable: invTotals._sum.available ?? 0,
      unitsReserved: invTotals._sum.reserved ?? 0,
      unitsSold: invTotals._sum.sold ?? 0,
      lowStockSkus: low,
      outOfStockSkus: out,
      valuePaise: num(valuation[0]?.value),
    },
  };
}

export async function adminOrdersCsv(days: number) {
  const { since } = window(days);
  const rows = await prisma.sellerOrder.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 10_000,
    select: {
      status: true, subtotalPaise: true, discountPaise: true, deliveryPaise: true, taxPaise: true, totalPaise: true, createdAt: true,
      seller: { select: { businessName: true, store: { select: { name: true } } } },
      order: { select: { orderNo: true, payments: { select: { method: true, status: true }, take: 1 } } },
      commission: { select: { rateBp: true, amountPaise: true, netSellerPaise: true } },
    },
  });
  return toCsv(
    ['Order no', 'Placed at (UTC)', 'Seller', 'Status', 'Payment', 'Payment status', 'Items (INR)', 'Discount (INR)', 'Delivery (INR)', 'Total (INR)', 'GST included (INR)', 'Commission rate (%)', 'Commission (INR)', 'Seller net (INR)'],
    rows.map((r) => [
      r.order.orderNo, r.createdAt.toISOString(), r.seller.store?.name ?? r.seller.businessName, r.status, r.order.payments[0]?.method, r.order.payments[0]?.status,
      rupees(r.subtotalPaise), rupees(r.discountPaise), rupees(r.deliveryPaise), rupees(r.totalPaise), rupees(r.taxPaise),
      r.commission ? r.commission.rateBp / 100 : '', r.commission ? rupees(r.commission.amountPaise) : '', r.commission ? rupees(r.commission.netSellerPaise) : '',
    ]),
  );
}

export async function adminCommissionsCsv() {
  const rows = await prisma.commission.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10_000,
    select: {
      rateBp: true, amountPaise: true, netSellerPaise: true, createdAt: true,
      settlement: { select: { id: true, status: true } },
      sellerOrder: { select: { status: true, order: { select: { orderNo: true } }, seller: { select: { businessName: true } } } },
    },
  });
  return toCsv(
    ['Order no', 'Seller', 'Shipment status', 'Goods value (INR)', 'Rate (%)', 'Commission (INR)', 'Seller net (INR)', 'Settlement', 'Settlement status'],
    rows.map((r) => [
      r.sellerOrder.order.orderNo, r.sellerOrder.seller.businessName, r.sellerOrder.status, rupees(r.amountPaise + r.netSellerPaise), r.rateBp / 100,
      rupees(r.amountPaise), rupees(r.netSellerPaise), r.settlement?.id.slice(0, 8) ?? '', r.settlement?.status ?? 'Unsettled',
    ]),
  );
}

// ───────────────────────── Settlements ─────────────────────────

const eligible = (sellerId?: string): Prisma.CommissionWhereInput => ({
  settlementId: null,
  sellerOrder: { status: 'DELIVERED', ...(sellerId ? { sellerId } : {}) },
});

/** Delivered, unsettled commission per seller: what an administrator can settle today. */
export async function pendingSettlements() {
  const rows = await prisma.commission.findMany({
    where: eligible(),
    select: { amountPaise: true, netSellerPaise: true, sellerOrder: { select: { sellerId: true, seller: { select: { businessName: true, store: { select: { name: true } } } } } } },
  });
  const map = new Map<string, { sellerId: string; name: string; shipments: number; grossPaise: number; commissionPaise: number; netPaise: number }>();
  for (const r of rows) {
    const id = r.sellerOrder.sellerId;
    const cur = map.get(id) ?? { sellerId: id, name: r.sellerOrder.seller.store?.name ?? r.sellerOrder.seller.businessName, shipments: 0, grossPaise: 0, commissionPaise: 0, netPaise: 0 };
    cur.shipments += 1;
    cur.grossPaise += r.amountPaise + r.netSellerPaise;
    cur.commissionPaise += r.amountPaise;
    cur.netPaise += r.netSellerPaise;
    map.set(id, cur);
  }
  return [...map.values()].sort((a, b) => b.netPaise - a.netPaise);
}

export async function listSettlements() {
  const rows = await prisma.sellerSettlement.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, periodStart: true, periodEnd: true, grossPaise: true, commissionPaise: true, netPaise: true, status: true, createdAt: true, seller: { select: { id: true, businessName: true, store: { select: { name: true } } } }, _count: { select: { commissions: true } } },
  });
  return rows.map((r) => ({ ...r, sellerName: r.seller.store?.name ?? r.seller.businessName, shipments: r._count.commissions, seller: undefined, _count: undefined }));
}

export async function createSettlement(adminId: string, sellerId: string) {
  const seller = await prisma.seller.findFirst({ where: { id: sellerId, deletedAt: null }, select: { id: true, userId: true } });
  if (!seller) throw AppError.notFound('Seller not found');
  const settlement = await prisma.$transaction(async (tx) => {
    const rows = await tx.commission.findMany({ where: eligible(sellerId), select: { id: true, amountPaise: true, netSellerPaise: true, createdAt: true } });
    if (rows.length === 0) throw AppError.conflict('This seller has no delivered, unsettled orders');
    const commission = rows.reduce((n, r) => n + r.amountPaise, 0);
    const net = rows.reduce((n, r) => n + r.netSellerPaise, 0);
    const created = await tx.sellerSettlement.create({
      data: {
        sellerId,
        periodStart: new Date(Math.min(...rows.map((r) => r.createdAt.getTime()))),
        periodEnd: new Date(),
        grossPaise: commission + net,
        commissionPaise: commission,
        netPaise: net,
      },
    });
    // Compare-and-set: a concurrent settlement that already claimed a row makes the counts differ.
    const claimed = await tx.commission.updateMany({ where: { id: { in: rows.map((r) => r.id) }, settlementId: null }, data: { settlementId: created.id } });
    if (claimed.count !== rows.length) throw AppError.conflict('Another settlement was just created. Refresh and try again.');
    return created;
  });
  await audit({ actorId: adminId, action: 'settlement.create', entity: 'seller_settlement', entityId: settlement.id, meta: { sellerId, netPaise: settlement.netPaise } });
  await notify({ userId: seller.userId, type: 'settlement.created', title: 'A payout was prepared for you', body: 'Your earnings statement is ready under Reports.', link: '/seller/reports' }).catch(() => undefined);
  return settlement;
}

export async function markSettlementPaid(adminId: string, id: string) {
  const res = await prisma.sellerSettlement.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'PAID' } });
  if (res.count === 0) {
    const exists = await prisma.sellerSettlement.findUnique({ where: { id }, select: { id: true } });
    throw exists ? AppError.conflict('This settlement is already paid') : AppError.notFound('Settlement not found');
  }
  const s = await prisma.sellerSettlement.findUniqueOrThrow({ where: { id }, select: { id: true, netPaise: true, seller: { select: { userId: true } } } });
  await audit({ actorId: adminId, action: 'settlement.paid', entity: 'seller_settlement', entityId: id, meta: { netPaise: s.netPaise } });
  await notify({ userId: s.seller.userId, type: 'settlement.paid', title: 'Payout marked as paid', body: 'This is a demo: no real transfer was made.', link: '/seller/reports' }).catch(() => undefined);
  return { id, status: 'PAID' as const };
}

// ───────────────────────── Settings ─────────────────────────

export async function getAdminSettings() {
  return { values: await getSettings(), defaults: { ...SETTING_DEFAULTS } };
}

export async function updateSettings(adminId: string, patch: SettingsInput) {
  const before = await getSettings();
  await prisma.$transaction(
    Object.entries(patch).map(([key, value]) =>
      prisma.platformSetting.upsert({ where: { key }, update: { value: value as number }, create: { key, value: value as number } }),
    ),
  );
  clearSettingsCache();
  const after = await getSettings();
  await audit({ actorId: adminId, action: 'settings.update', entity: 'platform_settings', meta: { before, after } as unknown as Prisma.InputJsonValue });
  return { values: after, defaults: { ...SETTING_DEFAULTS } };
}
