import { z } from 'zod';
import { paginationSchema } from './common';

export const PRODUCT_SORTS = ['popular', 'newest', 'price_asc', 'price_desc', 'rating'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const bool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const productListQuerySchema = paginationSchema
  .extend({
    q: z.string().trim().max(80).optional(),
    /** Category slug; a parent category includes its sub-categories. */
    category: z.string().trim().max(80).optional(),
    /** Store slug: only that seller's products. */
    store: z.string().trim().max(80).optional(),
    /** Comma-separated brand slugs. */
    brand: z
      .string()
      .trim()
      .max(300)
      .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20))
      .optional(),
    /** Price bounds in paise. */
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    /** Minimum average rating, 1-5. */
    rating: z.coerce.number().min(1).max(5).optional(),
    inStock: bool.optional(),
    sort: z.enum(PRODUCT_SORTS).default('popular'),
    facets: bool.optional(),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'minPrice cannot exceed maxPrice',
    path: ['minPrice'],
  });
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const suggestQuerySchema = z.object({ q: z.string().trim().min(1).max(60) });

export const reviewListQuerySchema = paginationSchema.extend({
  sort: z.enum(['recent', 'high', 'low']).default('recent'),
});

export const MAX_QTY_PER_LINE = 10;

export const cartAddSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE).default(1),
});
export type CartAddInput = z.infer<typeof cartAddSchema>;

export const cartUpdateSchema = z.object({
  quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE),
});
export type CartUpdateInput = z.infer<typeof cartUpdateSchema>;
