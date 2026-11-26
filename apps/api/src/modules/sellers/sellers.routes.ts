import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';

export const sellersRouter = Router();

sellersRouter.use(authenticate, requireRole('SELLER'));

// The seller is always resolved from the token, never from a request parameter.
sellersRouter.get('/me', async (req, res) => {
  const seller = await prisma.seller.findFirst({
    where: { userId: req.user!.id, deletedAt: null },
    include: { store: true, documents: true },
  });
  if (!seller) throw AppError.notFound('Seller profile not found');
  res.json({ success: true, data: { seller } });
});
