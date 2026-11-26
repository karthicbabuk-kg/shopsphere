import { Router } from 'express';
import { z } from 'zod';
import {
  adminOrderQuerySchema,
  reportQuerySchema,
  settingsSchema,
  settlementCreateSchema,
} from '@shopsphere/shared-validation';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as reports from './reports.service.js';
import * as orders from '../orders/orders.service.js';

const id = (v: unknown) => z.string().uuid('Invalid id').parse(v);
const csv = (res: import('express').Response, name: string, body: string) => {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
  res.send(body);
};
const stamp = () => new Date().toISOString().slice(0, 10);

/** /seller/reports — figures for the token's seller only. */
export const sellerReportsRouter = Router();
sellerReportsRouter.use(authenticate, requireRole('SELLER'));
sellerReportsRouter.get('/summary', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { days } = reportQuerySchema.parse(req.query);
  res.json({ success: true, data: await reports.sellerReport(req.user!.id, days) });
});
sellerReportsRouter.get('/orders.csv', async (req, res) => {
  const { days } = reportQuerySchema.parse(req.query);
  csv(res, `my-orders-${stamp()}.csv`, await reports.sellerOrdersCsv(req.user!.id, days));
});
sellerReportsRouter.get('/settlements', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: { items: await reports.sellerSettlements(req.user!.id) } });
});

/** Admin analytics, order oversight, settlements and settings. */
export const adminReportsRouter = Router();
adminReportsRouter.use(authenticate, requireRole('ADMIN'));

adminReportsRouter.get('/reports/summary', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { days } = reportQuerySchema.parse(req.query);
  res.json({ success: true, data: await reports.adminReport(days) });
});
adminReportsRouter.get('/reports/orders.csv', async (req, res) => {
  const { days } = reportQuerySchema.parse(req.query);
  csv(res, `orders-${stamp()}.csv`, await reports.adminOrdersCsv(days));
});
adminReportsRouter.get('/reports/commissions.csv', async (_req, res) => {
  csv(res, `commissions-${stamp()}.csv`, await reports.adminCommissionsCsv());
});

adminReportsRouter.get('/orders', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { items, statusCounts, meta } = await orders.listAdminOrders(adminOrderQuerySchema.parse(req.query));
  res.json({ success: true, data: { items, statusCounts }, meta });
});
adminReportsRouter.get('/orders/:id', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: { order: await orders.getAdminOrder(id(req.params.id)) } });
});

adminReportsRouter.get('/settlements', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const [pending, items] = await Promise.all([reports.pendingSettlements(), reports.listSettlements()]);
  res.json({ success: true, data: { pending, items } });
});
adminReportsRouter.post('/settlements', validateBody(settlementCreateSchema), async (req, res) => {
  res.status(201).json({ success: true, data: { settlement: await reports.createSettlement(req.user!.id, req.body.sellerId) } });
});
adminReportsRouter.post('/settlements/:id/pay', async (req, res) => {
  res.json({ success: true, data: await reports.markSettlementPaid(req.user!.id, id(req.params.id)) });
});

adminReportsRouter.get('/settings', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await reports.getAdminSettings() });
});
adminReportsRouter.put('/settings', validateBody(settingsSchema), async (req, res) => {
  res.json({ success: true, data: await reports.updateSettings(req.user!.id, req.body) });
});
