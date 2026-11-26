import { Router } from 'express';
import { z } from 'zod';
import { updateStoreSchema } from '@shopsphere/shared-validation';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { acceptFiles, sniffType } from '../uploads/upload.middleware.js';
import { destroyAssets, sellerFolder, uploadBuffer } from '../uploads/cloudinary.service.js';

export const sellersRouter = Router();

sellersRouter.use(authenticate, requireRole('SELLER'));

const profileInclude = { store: true, documents: { orderBy: { createdAt: 'desc' } } } as const;

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

sellersRouter.post('/me/logo', acceptFiles('file', ['jpeg', 'png', 'webp'], 1), async (req, res) => {
  const seller = await ownSeller(req.user!.id);
  const [file] = req.files as Express.Multer.File[];
  const asset = await uploadBuffer(file!.buffer, { folder: sellerFolder(seller.id, 'store') });
  const previous = seller.store?.logoUrl;
  await prisma.sellerStore.update({ where: { sellerId: seller.id }, data: { logoUrl: asset.url } });
  // The previous logo's public id is the path after /upload/(v123/) without extension.
  const old = previous?.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i)?.[1];
  if (old?.startsWith(`${sellerFolder(seller.id, 'store')}/`)) await destroyAssets([old]);
  res.json({ success: true, data: { seller: await ownSeller(req.user!.id) } });
});

const documentTypeSchema = z.object({
  type: z.enum(['GST certificate', 'PAN card', 'Business registration', 'Bank proof', 'Other']),
});

sellersRouter.post('/me/documents', acceptFiles('file', ['jpeg', 'png', 'pdf'], 1), async (req, res) => {
  const { type } = documentTypeSchema.parse(req.body);
  const seller = await ownSeller(req.user!.id);
  if (seller.documents.length >= 10) throw AppError.badRequest('You can upload up to 10 documents');
  const [file] = req.files as Express.Multer.File[];
  const isPdf = sniffType(file!.buffer) === 'pdf';
  const asset = await uploadBuffer(file!.buffer, {
    folder: sellerFolder(seller.id, 'documents'),
    resourceType: isPdf ? 'raw' : 'image',
  });
  await prisma.sellerDocument.create({
    data: { sellerId: seller.id, type, url: asset.url, publicId: asset.publicId },
  });
  res.status(201).json({ success: true, data: { seller: await ownSeller(req.user!.id) } });
});

sellersRouter.delete('/me/documents/:docId', async (req, res) => {
  const docId = z.string().uuid().parse(req.params.docId);
  const seller = await ownSeller(req.user!.id);
  const doc = seller.documents.find((d) => d.id === docId);
  if (!doc) throw AppError.notFound('Document not found');
  await prisma.sellerDocument.delete({ where: { id: docId } });
  if (doc.publicId) {
    await destroyAssets([doc.publicId], /\/raw\/upload\//.test(doc.url) ? 'raw' : 'image');
  }
  res.json({ success: true, data: { seller: await ownSeller(req.user!.id) } });
});
