import { z } from 'zod';
import { paginationSchema } from './common';

const paise = z.number().int().positive().max(1_00_00_00_000); // up to ₹10 crore

export const imageRefSchema = z.object({
  url: z.string().url(),
  publicId: z.string().min(3).max(200),
});
export type ImageRef = z.infer<typeof imageRefSchema>;

export const variantInputSchema = z.object({
  /** Present when updating an existing variant. */
  id: z.string().uuid().optional(),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._-]{2,39}$/, 'SKU: 3-40 letters, numbers, dot, dash or underscore'),
  label: z.string().trim().min(1).max(60).default('Default'),
  optionValues: z.record(z.string().max(40), z.string().max(60)).default({}),
  pricePaise: paise.optional(),
  mrpPaise: paise.optional(),
  /** Only used when the variant is created; later changes go through inventory operations. */
  openingStock: z.number().int().min(0).max(1_000_000).default(0),
  reorderLevel: z.number().int().min(0).max(100_000).default(5),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const productInputSchema = z
  .object({
    name: z.string().trim().min(3, 'At least 3 characters').max(120),
    description: z.string().trim().min(20, 'Describe the product in at least 20 characters').max(5000),
    categoryId: z.string().uuid('Choose a category'),
    brandId: z.string().uuid().nullish(),
    mrpPaise: paise,
    pricePaise: paise,
    /** DRAFT = save privately; ACTIVE = submit for admin review. */
    status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
    images: z.array(imageRefSchema).max(8).default([]),
    attributes: z
      .array(z.object({ key: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(200) }))
      .max(30)
      .default([]),
    variants: z.array(variantInputSchema).min(1, 'Add at least one SKU').max(50),
  })
  .superRefine((p, ctx) => {
    if (p.pricePaise > p.mrpPaise) {
      ctx.addIssue({ code: 'custom', path: ['pricePaise'], message: 'Selling price cannot exceed MRP' });
    }
    if (p.status === 'ACTIVE' && p.images.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['images'], message: 'Add at least one image before submitting' });
    }
    const skus = new Set<string>();
    p.variants.forEach((v, i) => {
      if (skus.has(v.sku)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'sku'], message: 'Duplicate SKU' });
      skus.add(v.sku);
      const price = v.pricePaise ?? p.pricePaise;
      const mrp = v.mrpPaise ?? p.mrpPaise;
      if (price > mrp) {
        ctx.addIssue({ code: 'custom', path: ['variants', i, 'pricePaise'], message: 'Price cannot exceed MRP' });
      }
    });
  });
export type ProductInput = z.infer<typeof productInputSchema>;

export const sellerProductQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  approval: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
});
export type SellerProductQuery = z.infer<typeof sellerProductQuerySchema>;

export const adminProductQuerySchema = sellerProductQuerySchema.extend({
  sellerId: z.string().uuid().optional(),
});
export type AdminProductQuery = z.infer<typeof adminProductQuerySchema>;

export const PRODUCT_ACTIONS = ['approve', 'reject', 'suspend', 'reinstate'] as const;
export type ProductAction = (typeof PRODUCT_ACTIONS)[number];

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  parentId: z.string().uuid().nullish(),
  imageUrl: z.string().url().nullish(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const brandInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  logoUrl: z.string().url().nullish(),
  active: z.boolean().default(true),
});
export type BrandInput = z.infer<typeof brandInputSchema>;
