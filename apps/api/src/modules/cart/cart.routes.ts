import { Router } from 'express';
import { z } from 'zod';
import { cartAddSchema, cartUpdateSchema } from '@shopsphere/shared-validation';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as cart from './cart.service.js';

export const cartRouter = Router();
cartRouter.use(authenticate, requireRole('BUYER'));

const itemId = (v: unknown) => z.string().uuid('Invalid id').parse(v);

cartRouter.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await cart.getCart(req.user!.id) });
});

cartRouter.post('/items', validateBody(cartAddSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await cart.addItem(req.user!.id, req.body.variantId, req.body.quantity) });
});

cartRouter.patch('/items/:id', validateBody(cartUpdateSchema), async (req, res) => {
  res.json({ success: true, data: await cart.setQuantity(req.user!.id, itemId(req.params.id), req.body.quantity) });
});

cartRouter.delete('/items/:id', async (req, res) => {
  res.json({ success: true, data: await cart.removeItem(req.user!.id, itemId(req.params.id)) });
});

cartRouter.delete('/', async (req, res) => {
  res.json({ success: true, data: await cart.clearCart(req.user!.id) });
});
