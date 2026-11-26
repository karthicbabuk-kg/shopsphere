import { Router } from 'express';
import * as svc from './categories.service.js';

/** Public, read-only. Management lives under /admin. */
export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res) => {
  res.json({ success: true, data: { categories: await svc.listPublicTree() } });
});
