import type {
  InventoryQuery,
  InventorySettingsInput,
  MovementQuery,
  StockAdjustInput,
  StockCountInput,
  StockInInput,
  StockOutInput,
  WarehouseInput,
} from '@shopsphere/shared-validation';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { pageArgs, pageMeta } from '../../utils/pagination.js';
import { requireSeller } from '../sellers/require-seller.js';
import {
  applyChange,
  loadInventoryContext,
  notifyStockThresholds,
  refNo,
  type Tx,
} from './inventory.core.js';

export * from './inventory.core.js';

/**
 * Creates the inventory row for a new variant and, when stock is provided, the immutable
 * OPENING movement.
 */
export async function createInventoryWithOpening(
  tx: Tx,
  input: {
    variantId: string;
    warehouseId: string;
    sellerId: string;
    openingStock: number;
    reorderLevel: number;
    userId: string;
    referenceNo: string;
  },
) {
  const inventory = await tx.inventory.create({
    data: {
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      available: input.openingStock,
      reorderLevel: input.reorderLevel,
    },
  });
  if (input.openingStock > 0) {
    await tx.stockMovement.create({
      data: {
        inventoryId: inventory.id,
        sellerId: input.sellerId,
        type: 'OPENING',
        previousQty: 0,
        changeQty: input.openingStock,
        newQty: input.openingStock,
        reason: 'Opening stock',
        referenceNo: input.referenceNo,
        createdById: input.userId,
      },
    });
  }
  return inventory;
}

// ── Ownership ──

/** Seller-scoped lookup: another seller's inventory is indistinguishable from "not found". */
async function ownedInventory(sellerId: string, inventoryId: string) {
  const inv = await prisma.inventory.findFirst({
    where: {
      id: inventoryId,
      warehouse: { sellerId },
      variant: { deletedAt: null, product: { deletedAt: null } },
    },
    select: { id: true, available: true, reserved: true, reorderLevel: true },
  });
  if (!inv) throw AppError.notFound('Inventory record not found');
  return inv;
}

// ── Stock operations ──

type Operation = {
  inventoryId: string;
  userId: string;
  type: 'INWARD' | 'OUTWARD' | 'ADJUSTMENT';
  deltaAvailable: number;
  reason?: string | null;
  referenceNo?: string | null;
  auditAction: string;
};

async function runOperation(op: Operation) {
  const seller = await requireSeller(op.userId);
  await ownedInventory(seller.id, op.inventoryId);
  const referenceNo = op.referenceNo || refNo(op.type.slice(0, 3));

  const result = await prisma.$transaction((tx) =>
    applyChange(tx, {
      inventoryId: op.inventoryId,
      sellerId: seller.id,
      type: op.type,
      deltas: { available: op.deltaAvailable, reserved: 0, sold: 0 },
      reason: op.reason,
      referenceNo,
      userId: op.userId,
    }),
  );

  const ctx = await loadInventoryContext(prisma, op.inventoryId);
  await notifyStockThresholds(result, ctx);
  await audit({
    actorId: op.userId,
    action: op.auditAction,
    entity: 'inventory',
    entityId: op.inventoryId,
    meta: { change: op.deltaAvailable, from: result.previousQty, to: result.newQty, referenceNo },
  });
  return { ...result, referenceNo };
}

export const stockIn = (userId: string, inventoryId: string, i: StockInInput) =>
  runOperation({
    inventoryId,
    userId,
    type: 'INWARD',
    deltaAvailable: i.quantity,
    reason: i.reason || 'Stock received',
    referenceNo: i.referenceNo,
    auditAction: 'inventory.inward',
  });

export const stockOut = (userId: string, inventoryId: string, i: StockOutInput) =>
  runOperation({
    inventoryId,
    userId,
    type: 'OUTWARD',
    deltaAvailable: -i.quantity,
    reason: i.reason,
    referenceNo: i.referenceNo,
    auditAction: 'inventory.outward',
  });

export const adjustStock = (userId: string, inventoryId: string, i: StockAdjustInput) =>
  runOperation({
    inventoryId,
    userId,
    type: 'ADJUSTMENT',
    deltaAvailable: i.delta,
    reason: i.reason,
    referenceNo: i.referenceNo,
    auditAction: 'inventory.adjust',
  });

export async function updateSettings(userId: string, inventoryId: string, i: InventorySettingsInput) {
  const seller = await requireSeller(userId);
  await ownedInventory(seller.id, inventoryId);
  if (i.warehouseId) {
    const w = await prisma.warehouse.findFirst({ where: { id: i.warehouseId, sellerId: seller.id } });
    if (!w) throw AppError.badRequest('Warehouse not found');
  }
  await prisma.inventory.update({
    where: { id: inventoryId },
    data: { reorderLevel: i.reorderLevel, ...(i.warehouseId ? { warehouseId: i.warehouseId } : {}) },
  });
  await audit({ actorId: userId, action: 'inventory.settings', entity: 'inventory', entityId: inventoryId });
}

// ── Stock counts and reconciliation ──

/** Records a physical count. A mismatch opens a discrepancy that must be applied or dismissed. */
export async function recordCount(userId: string, inventoryId: string, i: StockCountInput) {
  const seller = await requireSeller(userId);
  const inv = await ownedInventory(seller.id, inventoryId);

  const open = await prisma.stockAdjustment.findFirst({ where: { inventoryId, status: 'OPEN' } });
  if (open) throw AppError.conflict('Resolve the open stock count for this SKU before recording another');

  const difference = i.countedQty - inv.available;
  const adjustment = await prisma.stockAdjustment.create({
    data: {
      inventoryId,
      expectedQty: inv.available,
      countedQty: i.countedQty,
      difference,
      reason: i.reason || null,
      // A count that matches the system needs no action.
      status: difference === 0 ? 'APPLIED' : 'OPEN',
      createdById: userId,
    },
  });
  await audit({
    actorId: userId,
    action: 'inventory.count',
    entity: 'inventory',
    entityId: inventoryId,
    meta: { expected: inv.available, counted: i.countedQty, difference },
  });
  return adjustment;
}

async function ownedAdjustment(sellerId: string, adjustmentId: string) {
  const adj = await prisma.stockAdjustment.findFirst({
    where: { id: adjustmentId, inventory: { warehouse: { sellerId } } },
  });
  if (!adj) throw AppError.notFound('Stock count not found');
  return adj;
}

/**
 * Applies the discrepancy as a RECONCILIATION movement. The correction is the *difference* found
 * at count time, applied to the current quantity, so sales since the count are not overwritten.
 */
export async function applyAdjustment(userId: string, adjustmentId: string) {
  const seller = await requireSeller(userId);
  const adj = await ownedAdjustment(seller.id, adjustmentId);
  const referenceNo = refNo('CNT');

  const result = await prisma.$transaction(async (tx) => {
    // Atomic claim: only one caller can apply it.
    const claimed = await tx.stockAdjustment.updateMany({
      where: { id: adj.id, status: 'OPEN' },
      data: { status: 'APPLIED' },
    });
    if (claimed.count === 0) throw AppError.conflict('This stock count has already been resolved');
    try {
      return await applyChange(tx, {
        inventoryId: adj.inventoryId,
        sellerId: seller.id,
        type: 'RECONCILIATION',
        deltas: { available: adj.difference, reserved: 0, sold: 0 },
        reason: `Stock count: expected ${adj.expectedQty}, counted ${adj.countedQty}${adj.reason ? ` (${adj.reason})` : ''}`,
        referenceNo,
        userId,
      });
    } catch (e) {
      if (e instanceof AppError && e.status === 409) {
        throw AppError.conflict('Stock has changed since this count and the correction no longer fits. Please recount.');
      }
      throw e;
    }
  });

  await notifyStockThresholds(result, await loadInventoryContext(prisma, adj.inventoryId));
  await audit({
    actorId: userId,
    action: 'inventory.reconcile',
    entity: 'inventory',
    entityId: adj.inventoryId,
    meta: { adjustmentId, difference: adj.difference, referenceNo },
  });
  return { ...result, referenceNo };
}

export async function dismissAdjustment(userId: string, adjustmentId: string) {
  const seller = await requireSeller(userId);
  const adj = await ownedAdjustment(seller.id, adjustmentId);
  const res = await prisma.stockAdjustment.updateMany({
    where: { id: adj.id, status: 'OPEN' },
    data: { status: 'DISMISSED' },
  });
  if (res.count === 0) throw AppError.conflict('This stock count has already been resolved');
  await audit({ actorId: userId, action: 'inventory.count_dismissed', entity: 'inventory', entityId: adj.inventoryId });
}

// ── Queries ──

function baseWhere(sellerId: string): Prisma.InventoryWhereInput {
  return {
    warehouse: { sellerId },
    variant: { deletedAt: null, product: { deletedAt: null, status: { not: 'ARCHIVED' } } },
  };
}

type StatusRow = { available: number; reorderLevel: number };
export const stockStatus = (r: StatusRow) =>
  r.available === 0 ? 'OUT' : r.available <= r.reorderLevel ? 'LOW' : 'IN_STOCK';

export async function listInventory(userId: string, q: InventoryQuery) {
  const seller = await requireSeller(userId);
  const where: Prisma.InventoryWhereInput = {
    ...baseWhere(seller.id),
    ...(q.status === 'OUT' ? { available: 0 } : {}),
    ...(q.status === 'LOW' ? { available: { gt: 0, lte: prisma.inventory.fields.reorderLevel } } : {}),
    ...(q.status === 'IN_STOCK' ? { available: { gt: prisma.inventory.fields.reorderLevel } } : {}),
    ...(q.q
      ? {
          OR: [
            { variant: { sku: { contains: q.q, mode: 'insensitive' } } },
            { variant: { product: { name: { contains: q.q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      orderBy: [{ variant: { product: { name: 'asc' } } }, { variant: { sku: 'asc' } }],
      ...pageArgs(q),
      select: {
        id: true,
        available: true,
        reserved: true,
        sold: true,
        reorderLevel: true,
        warehouse: { select: { id: true, name: true, location: true } },
        adjustments: { where: { status: 'OPEN' }, select: { id: true, expectedQty: true, countedQty: true, difference: true }, take: 1 },
        variant: {
          select: {
            id: true,
            sku: true,
            label: true,
            pricePaise: true,
            product: {
              select: {
                id: true,
                name: true,
                status: true,
                pricePaise: true,
                images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
              },
            },
          },
        },
      },
    }),
    prisma.inventory.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      variantId: r.variant.id,
      sku: r.variant.sku,
      label: r.variant.label,
      productId: r.variant.product.id,
      productName: r.variant.product.name,
      productStatus: r.variant.product.status,
      image: r.variant.product.images[0]?.url ?? null,
      unitPricePaise: r.variant.pricePaise ?? r.variant.product.pricePaise,
      available: r.available,
      reserved: r.reserved,
      sold: r.sold,
      reorderLevel: r.reorderLevel,
      status: stockStatus(r),
      warehouse: r.warehouse,
      openCount: r.adjustments[0] ?? null,
    })),
    meta: pageMeta(q, total),
  };
}

/** Headline numbers and the alert lists shown on the inventory page and seller dashboard. */
export async function inventorySummary(userId: string) {
  const seller = await requireSeller(userId);
  const base = baseWhere(seller.id);
  const alertSelect = {
    id: true,
    available: true,
    reorderLevel: true,
    variant: { select: { sku: true, product: { select: { id: true, name: true } } } },
  } as const;

  const [skus, totals, low, out, openCounts, valuation, outList, lowList, discrepancyList] = await Promise.all([
    prisma.inventory.count({ where: base }),
    prisma.inventory.aggregate({ where: base, _sum: { available: true, reserved: true, sold: true } }),
    prisma.inventory.count({ where: { ...base, available: { gt: 0, lte: prisma.inventory.fields.reorderLevel } } }),
    prisma.inventory.count({ where: { ...base, available: 0 } }),
    prisma.stockAdjustment.count({ where: { status: 'OPEN', inventory: base } }),
    prisma.$queryRaw<{ value: bigint }[]>`
      SELECT COALESCE(SUM(i.available::bigint * COALESCE(v."pricePaise", p."pricePaise")), 0) AS value
        FROM inventories i
        JOIN product_variants v ON v.id = i."variantId"
        JOIN products p ON p.id = v."productId"
        JOIN warehouses w ON w.id = i."warehouseId"
       WHERE w."sellerId" = ${seller.id}::uuid
         AND v."deletedAt" IS NULL AND p."deletedAt" IS NULL AND p.status <> 'ARCHIVED'`,
    prisma.inventory.findMany({ where: { ...base, available: 0 }, select: alertSelect, take: 8, orderBy: { updatedAt: 'desc' } }),
    prisma.inventory.findMany({
      where: { ...base, available: { gt: 0, lte: prisma.inventory.fields.reorderLevel } },
      select: alertSelect,
      take: 8,
      orderBy: { available: 'asc' },
    }),
    prisma.stockAdjustment.findMany({
      where: { status: 'OPEN', inventory: base },
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        expectedQty: true,
        countedQty: true,
        difference: true,
        createdAt: true,
        inventory: { select: { id: true, variant: { select: { sku: true, product: { select: { name: true } } } } } },
      },
    }),
  ]);

  const flat = (r: (typeof outList)[number]) => ({
    inventoryId: r.id,
    sku: r.variant.sku,
    productName: r.variant.product.name,
    available: r.available,
    reorderLevel: r.reorderLevel,
  });

  return {
    skuCount: skus,
    unitsAvailable: totals._sum.available ?? 0,
    unitsReserved: totals._sum.reserved ?? 0,
    unitsSold: totals._sum.sold ?? 0,
    lowStockCount: low,
    outOfStockCount: out,
    openDiscrepancies: openCounts,
    // Valued at selling price (cost price is not tracked).
    valuationPaise: Number(valuation[0]?.value ?? 0),
    alerts: {
      outOfStock: outList.map(flat),
      reorderRequired: lowList.map(flat),
      discrepancies: discrepancyList.map((d) => ({
        adjustmentId: d.id,
        inventoryId: d.inventory.id,
        sku: d.inventory.variant.sku,
        productName: d.inventory.variant.product.name,
        expectedQty: d.expectedQty,
        countedQty: d.countedQty,
        difference: d.difference,
        createdAt: d.createdAt,
      })),
    },
  };
}

export async function listMovements(userId: string, q: MovementQuery) {
  const seller = await requireSeller(userId);
  const where: Prisma.StockMovementWhereInput = {
    sellerId: seller.id,
    ...(q.type ? { type: q.type } : {}),
    ...(q.inventoryId ? { inventoryId: q.inventoryId } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageArgs(q),
      include: { inventory: { select: { variant: { select: { sku: true, product: { select: { name: true } } } } } } },
    }),
    prisma.stockMovement.count({ where }),
  ]);
  const userIds = [...new Set(rows.flatMap((r) => (r.createdById ? [r.createdById] : [])))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  return {
    items: rows.map((r) => ({
      id: r.id,
      inventoryId: r.inventoryId,
      type: r.type,
      sku: r.inventory.variant.sku,
      productName: r.inventory.variant.product.name,
      previousQty: r.previousQty,
      changeQty: r.changeQty,
      newQty: r.newQty,
      reason: r.reason,
      referenceNo: r.referenceNo,
      by: r.createdById ? (nameOf.get(r.createdById) ?? 'Unknown') : 'System',
      createdAt: r.createdAt,
    })),
    meta: pageMeta(q, total),
  };
}

export async function listAdjustments(userId: string, status: 'OPEN' | 'APPLIED' | 'DISMISSED' | undefined, page: { page: number; pageSize: number }) {
  const seller = await requireSeller(userId);
  const where: Prisma.StockAdjustmentWhereInput = {
    inventory: { warehouse: { sellerId: seller.id } },
    ...(status ? { status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.stockAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...pageArgs(page),
      include: { inventory: { select: { id: true, available: true, variant: { select: { sku: true, product: { select: { name: true } } } } } } },
    }),
    prisma.stockAdjustment.count({ where }),
  ]);
  return {
    items: rows.map((a) => ({
      id: a.id,
      inventoryId: a.inventoryId,
      sku: a.inventory.variant.sku,
      productName: a.inventory.variant.product.name,
      expectedQty: a.expectedQty,
      countedQty: a.countedQty,
      difference: a.difference,
      currentAvailable: a.inventory.available,
      reason: a.reason,
      status: a.status,
      createdAt: a.createdAt,
    })),
    meta: pageMeta(page, total),
  };
}

// ── Warehouses (simplified locations) ──

export async function listWarehouses(userId: string) {
  const seller = await requireSeller(userId);
  const rows = await prisma.warehouse.findMany({
    where: { sellerId: seller.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: { _count: { select: { inventories: true } } },
  });
  return rows.map(({ _count, ...w }) => ({ ...w, skuCount: _count.inventories }));
}

export async function createWarehouse(userId: string, i: WarehouseInput) {
  const seller = await requireSeller(userId);
  const dup = await prisma.warehouse.findFirst({
    where: { sellerId: seller.id, name: { equals: i.name, mode: 'insensitive' } },
  });
  if (dup) throw AppError.conflict('You already have a warehouse with this name');
  const w = await prisma.warehouse.create({
    data: { sellerId: seller.id, name: i.name, location: i.location ?? null },
  });
  await audit({ actorId: userId, action: 'warehouse.create', entity: 'warehouse', entityId: w.id });
  return w;
}
