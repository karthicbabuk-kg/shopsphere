import { Router } from 'express';
import { z } from 'zod';
import { productInputSchema, sellerProductQuerySchema } from '@shopsphere/shared-validation';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as svc from './seller-products.service.js';

export const sellerProductsRouter = Router();
sellerProductsRouter.use(authenticate, requireRole('SELLER'));

const id = (v: unknown) => z.string().uuid('Invalid id').parse(v);

sellerProductsRouter.get('/', async (req, res) => {
  const q = sellerProductQuerySchema.parse(req.query);
  const { items, meta } = await svc.listSellerProducts(req.user!.id, q);
  res.json({ success: true, data: { items }, meta });
});

sellerProductsRouter.post('/', validateBody(productInputSchema), async (req, res) => {
  res.status(201).json({ success: true, data: { product: await svc.createProduct(req.user!.id, req.body) } });
});

sellerProductsRouter.get('/:id', async (req, res) => {
  res.json({ success: true, data: { product: await svc.getSellerProduct(req.user!.id, id(req.params.id)) } });
});

sellerProductsRouter.put('/:id', validateBody(productInputSchema), async (req, res) => {
  res.json({ success: true, data: { product: await svc.updateProduct(req.user!.id, id(req.params.id), req.body) } });
});

sellerProductsRouter.delete('/:id', async (req, res) => {
  res.json({ success: true, data: { product: await svc.archiveProduct(req.user!.id, id(req.params.id)) } });
});
