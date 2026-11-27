import { Router } from 'express';
import { z } from 'zod';
import {
  cancelSchema,
  orderListQuerySchema,
  placeOrderSchema,
  quoteSchema,
  returnRequestSchema,
  sellerOrderActionSchema,
  sellerOrderListQuerySchema,
} from '@shopsphere/shared-validation';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { orderLimiter, quoteLimiter } from '../../middleware/limiters.js';
import { validateBody } from '../../middleware/validate.js';
import { AppError } from '../../utils/errors.js';
import * as orders from './orders.service.js';

const id = (v: unknown) => z.string().uuid('Invalid id').parse(v);
const noStore = (res: import('express').Response) => res.set('Cache-Control', 'no-store');

/** POST /checkout/quote — server-side price, delivery, discount and tax for the current cart. */
export const checkoutRouter = Router();
checkoutRouter.use(authenticate, requireRole('BUYER'));
checkoutRouter.post('/quote', quoteLimiter, validateBody(quoteSchema), async (req, res) => {
  noStore(res);
  res.json({ success: true, data: await orders.quote(req.user!.id, req.body.couponCode) });
});

/** /orders — the buyer's orders. Every query is scoped to the token's user. */
export const ordersRouter = Router();
ordersRouter.use(authenticate, requireRole('BUYER'));

ordersRouter.post('/', orderLimiter, validateBody(placeOrderSchema), async (req, res) => {
  const header = req.header('Idempotency-Key');
  if (header !== undefined && !/^[A-Za-z0-9_-]{8,80}$/.test(header)) {
    throw AppError.badRequest('Idempotency-Key must be 8-80 letters, numbers, dashes or underscores');
  }
  const { order, replayed } = await orders.placeOrder(req.user!.id, req.body, header);
  res.status(replayed ? 200 : 201).json({ success: true, data: { order, replayed } });
});

ordersRouter.get('/', async (req, res) => {
  noStore(res);
  const q = orderListQuerySchema.parse(req.query);
  const { items, meta } = await orders.listBuyerOrders(req.user!.id, q);
  res.json({ success: true, data: { items }, meta });
});

ordersRouter.get('/:id', async (req, res) => {
  noStore(res);
  res.json({ success: true, data: { order: await orders.getBuyerOrder(req.user!.id, id(req.params.id)) } });
});

ordersRouter.post('/:id/cancel', validateBody(cancelSchema), async (req, res) => {
  res.json({ success: true, data: { order: await orders.buyerCancelOrder(req.user!.id, id(req.params.id), req.body.reason) } });
});

ordersRouter.post('/:id/shipments/:sid/cancel', validateBody(cancelSchema), async (req, res) => {
  res.json({ success: true, data: { order: await orders.buyerCancelShipment(req.user!.id, id(req.params.id), id(req.params.sid), req.body.reason) } });
});

ordersRouter.post('/:id/shipments/:sid/return', validateBody(returnRequestSchema), async (req, res) => {
  res.json({ success: true, data: { order: await orders.buyerRequestReturn(req.user!.id, id(req.params.id), id(req.params.sid), req.body.reason) } });
});

/** /seller/orders — shipments belonging to the token's seller. */
export const sellerOrdersRouter = Router();
sellerOrdersRouter.use(authenticate, requireRole('SELLER'));

sellerOrdersRouter.get('/', async (req, res) => {
  noStore(res);
  const q = sellerOrderListQuerySchema.parse(req.query);
  const { items, counts, meta } = await orders.listSellerOrders(req.user!.id, q);
  res.json({ success: true, data: { items, counts }, meta });
});

sellerOrdersRouter.get('/:id', async (req, res) => {
  noStore(res);
  res.json({ success: true, data: { order: await orders.getSellerOrder(req.user!.id, id(req.params.id)) } });
});

sellerOrdersRouter.post('/:id/actions', validateBody(sellerOrderActionSchema), async (req, res) => {
  res.json({ success: true, data: { order: await orders.sellerAct(req.user!.id, id(req.params.id), req.body) } });
});
