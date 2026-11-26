import { Router } from 'express';
import { z } from 'zod';
import { reviewSchema } from '@shopsphere/shared-validation';
import { prisma } from '../../database/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { AppError } from '../../utils/errors.js';

const id = (v: unknown) => z.string().uuid('Invalid id').parse(v);

/** A buyer may review a product only after one of their shipments containing it was delivered. */
async function hasPurchased(userId: string, productId: string) {
  const item = await prisma.orderItem.findFirst({
    where: { variant: { productId }, sellerOrder: { status: 'DELIVERED', order: { buyerId: userId } } },
    select: { id: true },
  });
  return !!item;
}

export const reviewsRouter = Router();
reviewsRouter.use(authenticate, requireRole('BUYER'));

/** The buyer's own review of a product and whether they are allowed to write one. */
reviewsRouter.get('/mine/:productId', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const productId = id(req.params.productId);
  const [review, eligible] = await Promise.all([
    prisma.review.findUnique({
      where: { productId_userId: { productId, userId: req.user!.id } },
      select: { id: true, rating: true, title: true, body: true },
    }),
    hasPurchased(req.user!.id, productId),
  ]);
  res.json({ success: true, data: { eligible: eligible || !!review, review } });
});

/** Creates or updates the buyer's review (one per product) and refreshes the product's rating. */
reviewsRouter.put('/:productId', validateBody(reviewSchema), async (req, res) => {
  const userId = req.user!.id;
  const productId = id(req.params.productId);
  if (!(await hasPurchased(userId, productId))) {
    throw AppError.forbidden('You can review a product once an order containing it has been delivered');
  }
  const review = await prisma.$transaction(async (tx) => {
    const saved = await tx.review.upsert({
      where: { productId_userId: { productId, userId } },
      create: { productId, userId, ...req.body },
      update: { rating: req.body.rating, title: req.body.title ?? null, body: req.body.body ?? null },
      select: { id: true, rating: true, title: true, body: true },
    });
    const agg = await tx.review.aggregate({ where: { productId }, _avg: { rating: true }, _count: true });
    await tx.product.update({
      where: { id: productId },
      data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100, ratingCount: agg._count },
    });
    return saved;
  });
  res.json({ success: true, data: { review } });
});
