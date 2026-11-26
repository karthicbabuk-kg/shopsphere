import { Router } from 'express';
import { z } from 'zod';
import {
  adjustmentQuerySchema,
  inventoryQuerySchema,
  inventorySettingsSchema,
  movementQuerySchema,
  stockAdjustSchema,
  stockCountSchema,
  stockInSchema,
  stockOutSchema,
  warehouseSchema,
} from '@shopsphere/shared-validation';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as inv from './inventory.service.js';

const id = (v: unknown) => z.string().uuid('Invalid id').parse(v);
const seller = [authenticate, requireRole('SELLER')] as const;

/** /seller/inventory — stock levels and operations. Every route is scoped to the token's seller. */
export const inventoryRouter = Router();
inventoryRouter.use(...seller);

inventoryRouter.get('/', async (req, res) => {
  const q = inventoryQuerySchema.parse(req.query);
  const { items, meta } = await inv.listInventory(req.user!.id, q);
  res.json({ success: true, data: { items }, meta });
});

inventoryRouter.get('/summary', async (req, res) => {
  res.json({ success: true, data: await inv.inventorySummary(req.user!.id) });
});

inventoryRouter.post('/:id/inward', validateBody(stockInSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await inv.stockIn(req.user!.id, id(req.params.id), req.body) });
});

inventoryRouter.post('/:id/outward', validateBody(stockOutSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await inv.stockOut(req.user!.id, id(req.params.id), req.body) });
});

inventoryRouter.post('/:id/adjust', validateBody(stockAdjustSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await inv.adjustStock(req.user!.id, id(req.params.id), req.body) });
});

inventoryRouter.post('/:id/count', validateBody(stockCountSchema), async (req, res) => {
  res.status(201).json({
    success: true,
    data: { adjustment: await inv.recordCount(req.user!.id, id(req.params.id), req.body) },
  });
});

inventoryRouter.patch('/:id/settings', validateBody(inventorySettingsSchema), async (req, res) => {
  await inv.updateSettings(req.user!.id, id(req.params.id), req.body);
  res.json({ success: true, data: { ok: true } });
});

/** /seller/stock-movements — the immutable ledger. */
export const stockMovementsRouter = Router();
stockMovementsRouter.use(...seller);
stockMovementsRouter.get('/', async (req, res) => {
  const q = movementQuerySchema.parse(req.query);
  const { items, meta } = await inv.listMovements(req.user!.id, q);
  res.json({ success: true, data: { items }, meta });
});

/** /seller/stock-adjustments — physical counts and their reconciliation. */
export const stockAdjustmentsRouter = Router();
stockAdjustmentsRouter.use(...seller);
stockAdjustmentsRouter.get('/', async (req, res) => {
  const q = adjustmentQuerySchema.parse(req.query);
  const { items, meta } = await inv.listAdjustments(req.user!.id, q.status, q);
  res.json({ success: true, data: { items }, meta });
});
stockAdjustmentsRouter.post('/:id/apply', async (req, res) => {
  res.json({ success: true, data: await inv.applyAdjustment(req.user!.id, id(req.params.id)) });
});
stockAdjustmentsRouter.post('/:id/dismiss', async (req, res) => {
  await inv.dismissAdjustment(req.user!.id, id(req.params.id));
  res.json({ success: true, data: { ok: true } });
});

/** /seller/warehouses */
export const warehousesRouter = Router();
warehousesRouter.use(...seller);
warehousesRouter.get('/', async (req, res) => {
  res.json({ success: true, data: { warehouses: await inv.listWarehouses(req.user!.id) } });
});
warehousesRouter.post('/', validateBody(warehouseSchema), async (req, res) => {
  res.status(201).json({ success: true, data: { warehouse: await inv.createWarehouse(req.user!.id, req.body) } });
});
