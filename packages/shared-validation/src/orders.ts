import { z } from 'zod';
import { paginationSchema } from './common';

const phone = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number');

export const addressSchema = z.object({
  label: z.string().trim().min(1, 'Required').max(20).default('Home'),
  name: z.string().trim().min(2, 'At least 2 characters').max(80),
  phone,
  line1: z.string().trim().min(3, 'Enter the house / street').max(120),
  line2: z.string().trim().max(120).optional().or(z.literal('').transform(() => undefined)),
  city: z.string().trim().min(2, 'Required').max(60),
  state: z.string().trim().min(2, 'Required').max(60),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit PIN code'),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const PAYMENT_METHODS = ['UPI', 'CARD', 'COD'] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number];

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3)
  .max(30)
  .regex(/^[A-Z0-9_-]+$/, 'Invalid coupon code');

export const quoteSchema = z.object({ couponCode: couponCodeSchema.optional() });
export type QuoteInput = z.infer<typeof quoteSchema>;

/**
 * Payments are simulated. No card number, UPI id or any other payment credential is ever sent;
 * `demoOutcome` lets a reviewer exercise the success and failure paths of the demo gateway.
 */
export const placeOrderSchema = z.object({
  addressId: z.string().uuid(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  couponCode: couponCodeSchema.optional(),
  demoOutcome: z.enum(['SUCCESS', 'FAIL']).default('SUCCESS'),
  /** The total the buyer saw; the order is refused if prices changed since. */
  expectedTotalPaise: z.number().int().min(0).optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const ORDER_STATUS_FILTERS = ['ALL', 'ACTIVE', 'DELIVERED', 'CANCELLED', 'RETURNS'] as const;
export const orderListQuerySchema = paginationSchema.extend({
  filter: z.enum(ORDER_STATUS_FILTERS).default('ALL'),
});

const reason = z.string().trim().min(3, 'Please give a short reason').max(300);
export const cancelSchema = z.object({ reason });
export const returnRequestSchema = z.object({ reason });

export const SELLER_ORDER_FILTERS = ['ALL', 'NEW', 'TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNS'] as const;
export const sellerOrderListQuerySchema = paginationSchema.extend({
  filter: z.enum(SELLER_ORDER_FILTERS).default('ALL'),
  q: z.string().trim().max(40).optional(),
});

export const CARRIERS = ['Delhivery', 'Blue Dart', 'Ecom Express', 'India Post', 'DTDC', 'Xpressbees'] as const;

export const sellerOrderActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('process') }),
  z.object({ action: z.literal('pack') }),
  z.object({
    action: z.literal('ship'),
    carrier: z.enum(CARRIERS),
    trackingNo: z
      .string()
      .trim()
      .max(40)
      .regex(/^[A-Za-z0-9-]*$/, 'Letters, numbers and dashes only')
      .optional(),
  }),
  z.object({ action: z.literal('deliver') }),
  z.object({ action: z.literal('cancel'), reason }),
  z.object({ action: z.literal('approve_return') }),
  z.object({ action: z.literal('reject_return'), reason }),
  z.object({ action: z.literal('receive_return') }),
]);
export type SellerOrderAction = z.infer<typeof sellerOrderActionSchema>;

export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Choose a rating').max(5),
  title: z.string().trim().max(80).optional().or(z.literal('').transform(() => undefined)),
  body: z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
});
export type ReviewInput = z.infer<typeof reviewSchema>;
