import { Router } from 'express';
import { z } from 'zod';
import {
  adminProductQuerySchema,
  brandInputSchema,
  categoryInputSchema,
  PRODUCT_ACTIONS,
  sellerListQuerySchema,
  sellerReasonSchema,
  type ProductAction,
} from '@shopsphere/shared-validation';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as admin from './admin.service.js';
import * as sellers from '../sellers/seller-admin.service.js';
import * as products from '../products/admin-products.service.js';
import * as categories from '../categories/categories.service.js';
import * as brands from '../brands/brands.service.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole('ADMIN'));

const idParam = (v: unknown) => z.string().uuid('Invalid id').parse(v);

adminRouter.get('/ping', (req, res) => {
  res.json({ success: true, data: { adminId: req.user!.id } });
});

adminRouter.get('/overview', async (_req, res) => {
  res.json({ success: true, data: await admin.overview() });
});

// ── Sellers ──
adminRouter.get('/sellers', async (req, res) => {
  const q = sellerListQuerySchema.parse(req.query);
  const { items, statusCounts, meta } = await sellers.listSellers(q);
  res.json({ success: true, data: { items, statusCounts }, meta });
});

adminRouter.get('/sellers/:id', async (req, res) => {
  res.json({ success: true, data: { seller: await sellers.getSeller(idParam(req.params.id)) } });
});

adminRouter.post('/sellers/:id/approve', async (req, res) => {
  const seller = await sellers.applyAction(idParam(req.params.id), 'approve', req.user!.id, undefined, req.ip);
  res.json({ success: true, data: { seller } });
});

adminRouter.post('/sellers/:id/reactivate', async (req, res) => {
  const seller = await sellers.applyAction(idParam(req.params.id), 'reactivate', req.user!.id, undefined, req.ip);
  res.json({ success: true, data: { seller } });
});

for (const action of ['reject', 'suspend'] as const) {
  adminRouter.post(`/sellers/:id/${action}`, async (req, res) => {
    const { reason } = sellerReasonSchema.parse(req.body);
    const seller = await sellers.applyAction(idParam(req.params.id), action, req.user!.id, reason, req.ip);
    res.json({ success: true, data: { seller } });
  });
}

// ── Product moderation ──
adminRouter.get('/products', async (req, res) => {
  const q = adminProductQuerySchema.parse(req.query);
  const { items, approvalCounts, meta } = await products.listProducts(q);
  res.json({ success: true, data: { items, approvalCounts }, meta });
});

adminRouter.get('/products/:id', async (req, res) => {
  res.json({ success: true, data: { product: await products.getProduct(idParam(req.params.id)) } });
});

adminRouter.post('/products/:id/:action', async (req, res) => {
  const action = z.enum(PRODUCT_ACTIONS).parse(req.params.action) as ProductAction;
  const reason = action === 'reject' || action === 'suspend' ? sellerReasonSchema.parse(req.body).reason : undefined;
  const product = await products.applyAction(idParam(req.params.id), action, req.user!.id, reason, req.ip);
  res.json({ success: true, data: { product } });
});

// ── Categories ──
adminRouter.get('/categories', async (_req, res) => {
  res.json({ success: true, data: { categories: await categories.listAdmin() } });
});
adminRouter.post('/categories', validateBody(categoryInputSchema), async (req, res) => {
  res.status(201).json({ success: true, data: { category: await categories.createCategory(req.body, req.user!.id) } });
});
adminRouter.put('/categories/:id', validateBody(categoryInputSchema), async (req, res) => {
  res.json({
    success: true,
    data: { category: await categories.updateCategory(idParam(req.params.id), req.body, req.user!.id) },
  });
});
adminRouter.delete('/categories/:id', async (req, res) => {
  await categories.deleteCategory(idParam(req.params.id), req.user!.id);
  res.json({ success: true, data: { deleted: true } });
});

// ── Brands ──
adminRouter.get('/brands', async (_req, res) => {
  res.json({ success: true, data: { brands: await brands.listAdmin() } });
});
adminRouter.post('/brands', validateBody(brandInputSchema), async (req, res) => {
  res.status(201).json({ success: true, data: { brand: await brands.createBrand(req.body, req.user!.id) } });
});
adminRouter.put('/brands/:id', validateBody(brandInputSchema), async (req, res) => {
  res.json({ success: true, data: { brand: await brands.updateBrand(idParam(req.params.id), req.body, req.user!.id) } });
});
adminRouter.delete('/brands/:id', async (req, res) => {
  await brands.deleteBrand(idParam(req.params.id), req.user!.id);
  res.json({ success: true, data: { deleted: true } });
});
