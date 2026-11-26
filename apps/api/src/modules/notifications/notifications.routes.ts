import { Router } from 'express';
import { z } from 'zod';
import { paginationSchema } from '@shopsphere/shared-validation';
import { authenticate } from '../../middleware/auth.js';
import * as svc from './notifications.service.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/', async (req, res) => {
  const page = paginationSchema.parse(req.query);
  const { items, unread, meta } = await svc.listNotifications(req.user!.id, page);
  res.json({ success: true, data: { items, unread }, meta });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await svc.markAllRead(req.user!.id);
  res.json({ success: true, data: { ok: true } });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await svc.markRead(req.user!.id, id);
  res.json({ success: true, data: { ok: true } });
});
