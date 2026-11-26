import { z } from 'zod';
import { paginationSchema } from './common';

export const SELLER_ACTIONS = ['approve', 'reject', 'suspend', 'reactivate'] as const;
export type SellerAction = (typeof SELLER_ACTIONS)[number];

export const sellerListQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
  q: z.string().trim().max(80).optional(),
});
export type SellerListQuery = z.infer<typeof sellerListQuerySchema>;

export const sellerReasonSchema = z.object({
  reason: z.string().trim().min(5, 'Please give a reason (at least 5 characters)').max(300),
});
export type SellerReasonInput = z.infer<typeof sellerReasonSchema>;

export const updateStoreSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).nullish(),
  contactEmail: z.string().trim().email().nullish(),
  contactPhone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
    .nullish(),
  city: z.string().trim().max(60).nullish(),
  state: z.string().trim().max(60).nullish(),
  businessName: z.string().trim().min(2).max(120).optional(),
});
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
