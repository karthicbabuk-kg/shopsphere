import { Router } from 'express';
import { prisma } from '../../database/prisma.js';

/** Public list of currently valid offers, shown on the storefront. Applying a coupon is part of checkout. */
export const couponsRouter = Router();

couponsRouter.get('/active', async (_req, res) => {
  const now = new Date();
  const rows = await prisma.coupon.findMany({
    where: { active: true, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }] },
    orderBy: { createdAt: 'asc' },
    select: { code: true, description: true, type: true, value: true, minOrderPaise: true, maxDiscountPaise: true, usageLimit: true, usedCount: true },
  });
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    success: true,
    data: {
      coupons: rows
        .filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit)
        .map(({ usageLimit: _l, usedCount: _u, ...c }) => c),
    },
  });
});
