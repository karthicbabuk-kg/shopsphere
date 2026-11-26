import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import * as wl from './wishlist.service.js';

export const wishlistRouter = Router();
wishlistRouter.use(authenticate, requireRole('BUYER'));

const productId = (v: unknown) => z.string().uuid('Invalid id').parse(v);

wishlistRouter.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await wl.listWishlist(req.user!.id) });
});

wishlistRouter.post('/:productId', async (req, res) => {
  res.status(201).json({ success: true, data: await wl.addToWishlist(req.user!.id, productId(req.params.productId)) });
});

wishlistRouter.delete('/:productId', async (req, res) => {
  res.json({ success: true, data: await wl.removeFromWishlist(req.user!.id, productId(req.params.productId)) });
});
