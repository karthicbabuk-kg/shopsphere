import { z } from 'zod';
import { paginationSchema } from './common';

export const REPORT_RANGES = [7, 30, 90] as const;
export const reportQuerySchema = z.object({
  days: z.coerce.number().int().refine((n) => (REPORT_RANGES as readonly number[]).includes(n), 'days must be 7, 30 or 90').default(30),
});

export const adminOrderQuerySchema = paginationSchema.extend({
  status: z.enum(['PLACED', 'CONFIRMED', 'PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']).optional(),
  q: z.string().trim().max(40).optional(),
});

export const settlementCreateSchema = z.object({ sellerId: z.string().uuid() });

const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** Editable platform settings with sane bounds. Money in paise, rates in basis points (100 = 1%). */
export const settingsSchema = z
  .object({
    deliveryFeePaise: int(0, 50_000),
    freeDeliveryThresholdPaise: int(0, 10_000_000),
    taxRateBp: int(0, 2_800),
    commissionBp: int(0, 5_000),
    minOrderPaise: int(0, 1_000_000),
    lowStockDefault: int(0, 1_000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one setting');
export type SettingsInput = z.infer<typeof settingsSchema>;
