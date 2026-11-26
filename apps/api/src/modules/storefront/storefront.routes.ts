import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { productListQuerySchema, reviewListQuerySchema, suggestQuerySchema } from '@shopsphere/shared-validation';
import * as svc from './storefront.service.js';

/** Public catalogue reads are briefly cacheable; stock-sensitive fields may be up to 30 s stale. */
const cacheable: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  next();
};

export const productsRouter = Router();
productsRouter.use(cacheable);

productsRouter.get('/', async (req, res) => {
  const q = productListQuerySchema.parse(req.query);
  const { items, meta, facets, category } = await svc.listProducts(q);
  res.json({ success: true, data: { items, facets, category }, meta });
});

productsRouter.get('/suggest', async (req, res) => {
  const { q } = suggestQuerySchema.parse(req.query);
  res.json({ success: true, data: await svc.suggest(q) });
});

productsRouter.get('/:slug', async (req, res) => {
  const slug = z.string().min(1).max(160).parse(req.params.slug);
  res.json({ success: true, data: { product: await svc.getProduct(slug) } });
});

productsRouter.get('/:slug/reviews', async (req, res) => {
  const slug = z.string().min(1).max(160).parse(req.params.slug);
  const q = reviewListQuerySchema.parse(req.query);
  const { items, meta } = await svc.listReviews(slug, q);
  res.json({ success: true, data: { items }, meta });
});

export const storefrontRouter = Router();
storefrontRouter.use(cacheable);
storefrontRouter.get('/home', async (_req, res) => {
  res.json({ success: true, data: await svc.homeSections() });
});
