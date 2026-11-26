import { Router } from 'express';
import { updateStoreSchema } from '@shopsphere/shared-validation';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';

export const sellersRouter = Router();

sellersRouter.use(authenticate, requireRole('SELLER'));

const profileInclude = { store: true, documents: true } as const;

// The seller is always resolved from the token, never from a request parameter.
async function ownSeller(userId: string) {
  const seller = await prisma.seller.findFirst({
    where: { userId, deletedAt: null },
    include: profileInclude,
  });
  if (!seller) throw AppError.notFound('Seller profile not found');
  return seller;
}

sellersRouter.get('/me', async (req, res) => {
  res.json({ success: true, data: { seller: await ownSeller(req.user!.id) } });
});

sellersRouter.patch('/me', validateBody(updateStoreSchema), async (req, res) => {
  const { businessName, ...store } = req.body as ReturnType<typeof updateStoreSchema.parse>;
  const seller = await ownSeller(req.user!.id);
  await prisma.seller.update({
    where: { id: seller.id },
    data: {
      ...(businessName ? { businessName } : {}),
      store: { update: store },
    },
  });
  await audit({
    actorId: req.user!.id,
    action: 'seller.profile_updated',
    entity: 'seller',
    entityId: seller.id,
    ip: req.ip,
  });
  res.json({ success: true, data: { seller: await ownSeller(req.user!.id) } });
});
