import { randomBytes } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { notify } from '../notifications/notifications.service.js';

export type Tx = Prisma.TransactionClient;
export type MovementType =
  | 'OPENING'
  | 'INWARD'
  | 'OUTWARD'
  | 'ADJUSTMENT'
  | 'RESERVE'
  | 'RELEASE'
  | 'SALE'
  | 'RETURN_RESTOCK'
  | 'RECONCILIATION';

export interface Deltas {
  available: number;
  reserved: number;
  sold: number;
}

export interface ChangeInput {
  inventoryId: string;
  sellerId: string;
  type: MovementType;
  deltas: Deltas;
  reason?: string | null;
  referenceNo?: string | null;
  userId?: string | null;
}

export interface ChangeResult {
  inventoryId: string;
  previousQty: number;
  newQty: number;
  reorderLevel: number;
}

export const refNo = (prefix: string) =>
  `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;

/**
 * The single place where stock quantities change.
 *
 * One conditional UPDATE both applies the change and enforces that none of available / reserved /
 * sold can go negative, so concurrent callers can never oversell: the database serialises row
 * updates and the loser's WHERE clause simply matches no row. The immutable ledger entry is
 * written in the same transaction, so quantities and history can never disagree.
 *
 * The ledger tracks the *available* quantity (previous → new); reserved and sold movements are
 * identified by the movement type.
 */
export async function applyChange(tx: Tx, c: ChangeInput): Promise<ChangeResult> {
  const { available: da, reserved: dr, sold: ds } = c.deltas;
  const rows = await tx.$queryRaw<{ prev: number; next: number; reorderLevel: number }[]>`
    UPDATE inventories
       SET available = available + ${da}::int,
           reserved  = reserved  + ${dr}::int,
           sold      = sold      + ${ds}::int,
           "updatedAt" = now()
     WHERE id = ${c.inventoryId}::uuid
       AND available + ${da}::int >= 0
       AND reserved  + ${dr}::int >= 0
       AND sold      + ${ds}::int >= 0
    RETURNING available - ${da}::int AS prev, available AS next, "reorderLevel"`;

  const row = rows[0];
  if (!row) {
    const exists = await tx.inventory.findUnique({ where: { id: c.inventoryId }, select: { available: true } });
    if (!exists) throw AppError.notFound('Inventory record not found');
    throw AppError.conflict('Insufficient stock for this operation', { available: exists.available });
  }

  await tx.stockMovement.create({
    data: {
      inventoryId: c.inventoryId,
      sellerId: c.sellerId,
      type: c.type,
      previousQty: row.prev,
      changeQty: da,
      newQty: row.next,
      reason: c.reason ?? null,
      referenceNo: c.referenceNo ?? null,
      createdById: c.userId ?? null,
    },
  });
  return { inventoryId: c.inventoryId, previousQty: row.prev, newQty: row.next, reorderLevel: row.reorderLevel };
}

/**
 * Alerts the seller when a change crosses into "out of stock" or "reorder required".
 * Call after the transaction commits; fires only on the crossing, never repeatedly.
 */
export async function notifyStockThresholds(
  r: ChangeResult,
  ctx: { sellerUserId: string; productName: string; sku: string },
) {
  const link = '/seller/inventory';
  if (r.newQty === 0 && r.previousQty > 0) {
    await notify({
      userId: ctx.sellerUserId,
      type: 'inventory.out_of_stock',
      title: `${ctx.productName} is out of stock`,
      body: `SKU ${ctx.sku} has no units left. Add stock to keep selling.`,
      link,
    });
  } else if (r.newQty > 0 && r.newQty <= r.reorderLevel && r.previousQty > r.reorderLevel) {
    await notify({
      userId: ctx.sellerUserId,
      type: 'inventory.low_stock',
      title: `Reorder needed: ${ctx.productName}`,
      body: `SKU ${ctx.sku} is down to ${r.newQty} (reorder level ${r.reorderLevel}).`,
      link,
    });
  }
}

/** Resolves the inventory row, its seller and the context needed for alerts. */
export async function loadInventoryContext(client: Tx | typeof prisma, inventoryId: string) {
  const inv = await client.inventory.findUnique({
    where: { id: inventoryId },
    select: {
      id: true,
      variant: { select: { sku: true, product: { select: { name: true } } } },
      warehouse: { select: { sellerId: true, seller: { select: { userId: true } } } },
    },
  });
  if (!inv) throw AppError.notFound('Inventory record not found');
  return {
    sellerId: inv.warehouse.sellerId,
    sellerUserId: inv.warehouse.seller.userId,
    sku: inv.variant.sku,
    productName: inv.variant.product.name,
  };
}

// ── Order-lifecycle operations (used inside the order transaction in Phase 8) ──

interface LifecycleInput {
  variantId: string;
  quantity: number;
  referenceNo: string;
  userId?: string | null;
  reason?: string;
}

async function inventoryOf(tx: Tx, variantId: string) {
  const inv = await tx.inventory.findUnique({
    where: { variantId },
    select: { id: true, warehouse: { select: { sellerId: true } } },
  });
  if (!inv) throw AppError.notFound('Inventory record not found');
  return { inventoryId: inv.id, sellerId: inv.warehouse.sellerId };
}

function assertQty(q: number) {
  if (!Number.isInteger(q) || q <= 0) throw AppError.badRequest('Quantity must be a positive whole number');
}

/** Order placed: units move from available to reserved. Fails (409) if not enough are available. */
export async function reserveStock(tx: Tx, i: LifecycleInput) {
  assertQty(i.quantity);
  const inv = await inventoryOf(tx, i.variantId);
  return applyChange(tx, {
    ...inv,
    type: 'RESERVE',
    deltas: { available: -i.quantity, reserved: i.quantity, sold: 0 },
    reason: i.reason ?? 'Reserved for order',
    referenceNo: i.referenceNo,
    userId: i.userId,
  });
}

/** Order cancelled before dispatch: reserved units return to available. */
export async function releaseStock(tx: Tx, i: LifecycleInput) {
  assertQty(i.quantity);
  const inv = await inventoryOf(tx, i.variantId);
  return applyChange(tx, {
    ...inv,
    type: 'RELEASE',
    deltas: { available: i.quantity, reserved: -i.quantity, sold: 0 },
    reason: i.reason ?? 'Released from cancelled order',
    referenceNo: i.referenceNo,
    userId: i.userId,
  });
}

/** Order shipped: reserved units become sold. Available is unchanged (already deducted at reserve). */
export async function commitSale(tx: Tx, i: LifecycleInput) {
  assertQty(i.quantity);
  const inv = await inventoryOf(tx, i.variantId);
  return applyChange(tx, {
    ...inv,
    type: 'SALE',
    deltas: { available: 0, reserved: -i.quantity, sold: i.quantity },
    reason: i.reason ?? 'Sold (order shipped)',
    referenceNo: i.referenceNo,
    userId: i.userId,
  });
}

/** Returned goods received: units go back on the shelf and out of the sold count. */
export async function restockReturn(tx: Tx, i: LifecycleInput) {
  assertQty(i.quantity);
  const inv = await inventoryOf(tx, i.variantId);
  return applyChange(tx, {
    ...inv,
    type: 'RETURN_RESTOCK',
    deltas: { available: i.quantity, reserved: 0, sold: -i.quantity },
    reason: i.reason ?? 'Returned item restocked',
    referenceNo: i.referenceNo,
    userId: i.userId,
  });
}
