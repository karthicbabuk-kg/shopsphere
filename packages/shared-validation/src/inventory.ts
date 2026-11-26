import { z } from 'zod';
import { paginationSchema } from './common';

const qty = z.number({ error: 'Enter a quantity' }).int('Whole units only');
const reasonText = z.string().trim().max(200);
const reference = z.string().trim().max(40).optional();

export const STOCK_MOVEMENT_TYPES = [
  'OPENING',
  'INWARD',
  'OUTWARD',
  'ADJUSTMENT',
  'RESERVE',
  'RELEASE',
  'SALE',
  'RETURN_RESTOCK',
  'RECONCILIATION',
] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_TYPES)[number];

export const stockInSchema = z.object({
  quantity: qty.min(1, 'Must be at least 1').max(1_000_000),
  reason: reasonText.optional(),
  referenceNo: reference,
});
export type StockInInput = z.infer<typeof stockInSchema>;

export const stockOutSchema = z.object({
  quantity: qty.min(1, 'Must be at least 1').max(1_000_000),
  reason: reasonText.min(3, 'Say why the stock is leaving (e.g. damaged, sample)'),
  referenceNo: reference,
});
export type StockOutInput = z.infer<typeof stockOutSchema>;

export const stockAdjustSchema = z.object({
  delta: qty.min(-1_000_000).max(1_000_000).refine((n) => n !== 0, 'Adjustment cannot be zero'),
  reason: reasonText.min(3, 'A reason is required for manual adjustments'),
  referenceNo: reference,
});
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;

export const stockCountSchema = z.object({
  countedQty: qty.min(0, 'Cannot be negative').max(10_000_000),
  reason: reasonText.optional(),
});
export type StockCountInput = z.infer<typeof stockCountSchema>;

export const inventorySettingsSchema = z.object({
  reorderLevel: qty.min(0).max(100_000),
  warehouseId: z.string().uuid().optional(),
});
export type InventorySettingsInput = z.infer<typeof inventorySettingsSchema>;

export const STOCK_STATUSES = ['IN_STOCK', 'LOW', 'OUT'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const inventoryQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
  status: z.enum(STOCK_STATUSES).optional(),
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

export const movementQuerySchema = paginationSchema.extend({
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  inventoryId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type MovementQuery = z.infer<typeof movementQuerySchema>;

export const adjustmentQuerySchema = paginationSchema.extend({
  status: z.enum(['OPEN', 'APPLIED', 'DISMISSED']).optional(),
});

export const warehouseSchema = z.object({
  name: z.string().trim().min(2).max(60),
  location: z.string().trim().max(120).nullish(),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;
