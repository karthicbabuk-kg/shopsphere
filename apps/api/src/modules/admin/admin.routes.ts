import { Router } from 'express';
import { z } from 'zod';
import { sellerListQuerySchema, sellerReasonSchema } from '@shopsphere/shared-validation';
import { authenticate, requireRole } from '../../middleware/auth.js';
import * as admin from './admin.service.js';
import * as sellers from '../sellers/seller-admin.service.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole('ADMIN'));

const idParam = (v: unknown) => z.string().uuid('Invalid id').parse(v);

adminRouter.get('/ping', (req, res) => {
  res.json({ success: true, data: { adminId: req.user!.id } });
});

adminRouter.get('/overview', async (_req, res) => {
  res.json({ success: true, data: await admin.overview() });
});

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
