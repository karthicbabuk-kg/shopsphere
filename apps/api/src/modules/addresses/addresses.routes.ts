import { Router } from 'express';
import { z } from 'zod';
import { addressSchema } from '@shopsphere/shared-validation';
import { prisma } from '../../database/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { AppError } from '../../utils/errors.js';

const MAX_ADDRESSES = 10;
const id = (v: unknown) => z.string().uuid('Invalid id').parse(v);
const select = {
  id: true, label: true, name: true, phone: true, line1: true, line2: true,
  city: true, state: true, pincode: true, isDefault: true,
} as const;

/** /addresses — the buyer's address book. Every query is scoped to the token's user. */
export const addressesRouter = Router();
addressesRouter.use(authenticate, requireRole('BUYER'));

const list = (userId: string) =>
  prisma.address.findMany({ where: { userId, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select });

addressesRouter.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: { items: await list(req.user!.id) } });
});

addressesRouter.post('/', validateBody(addressSchema), async (req, res) => {
  const userId = req.user!.id;
  const count = await prisma.address.count({ where: { userId, deletedAt: null } });
  if (count >= MAX_ADDRESSES) throw AppError.conflict(`You can save up to ${MAX_ADDRESSES} addresses`);
  // The first address is always the default.
  const makeDefault = req.body.isDefault || count === 0;
  const created = await prisma.$transaction(async (tx) => {
    if (makeDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.address.create({ data: { ...req.body, isDefault: makeDefault, userId }, select });
  });
  res.status(201).json({ success: true, data: { address: created } });
});

addressesRouter.patch('/:id', validateBody(addressSchema), async (req, res) => {
  const userId = req.user!.id;
  const addrId = id(req.params.id);
  const updated = await prisma.$transaction(async (tx) => {
    const own = await tx.address.findFirst({ where: { id: addrId, userId, deletedAt: null }, select: { id: true, isDefault: true } });
    if (!own) throw AppError.notFound('Address not found');
    const makeDefault = req.body.isDefault || own.isDefault;
    if (makeDefault) await tx.address.updateMany({ where: { userId, isDefault: true, id: { not: addrId } }, data: { isDefault: false } });
    return tx.address.update({ where: { id: addrId }, data: { ...req.body, isDefault: makeDefault }, select });
  });
  res.json({ success: true, data: { address: updated } });
});

addressesRouter.delete('/:id', async (req, res) => {
  const userId = req.user!.id;
  const addrId = id(req.params.id);
  await prisma.$transaction(async (tx) => {
    const own = await tx.address.findFirst({ where: { id: addrId, userId, deletedAt: null }, select: { isDefault: true } });
    if (!own) throw AppError.notFound('Address not found');
    // Soft delete: past orders keep a snapshot and a reference to the row.
    await tx.address.update({ where: { id: addrId }, data: { deletedAt: new Date(), isDefault: false } });
    if (own.isDefault) {
      const next = await tx.address.findFirst({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
  res.json({ success: true, data: { items: await list(userId) } });
});

addressesRouter.post('/:id/default', async (req, res) => {
  const userId = req.user!.id;
  const addrId = id(req.params.id);
  await prisma.$transaction(async (tx) => {
    const own = await tx.address.findFirst({ where: { id: addrId, userId, deletedAt: null }, select: { id: true } });
    if (!own) throw AppError.notFound('Address not found');
    await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    await tx.address.update({ where: { id: addrId }, data: { isDefault: true } });
  });
  res.json({ success: true, data: { items: await list(userId) } });
});
