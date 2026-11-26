import { Router } from 'express';
import * as svc from './brands.service.js';

/** Public, read-only. Management lives under /admin. */
export const brandsRouter = Router();

brandsRouter.get('/', async (_req, res) => {
  res.json({ success: true, data: { brands: await svc.listPublic() } });
});
