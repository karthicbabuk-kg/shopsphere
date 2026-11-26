import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { requireSeller } from '../sellers/require-seller.js';
import { acceptFiles } from './upload.middleware.js';
import { sellerFolder, uploadBuffer } from './cloudinary.service.js';

export const uploadsRouter = Router();
uploadsRouter.use(authenticate, requireRole('SELLER'));
uploadsRouter.use(
  rateLimit({
    windowMs: 60_000,
    limit: env.NODE_ENV === 'test' ? 10_000 : 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many uploads. Slow down.' } },
  }),
);

// Uploads product images into the caller's own Cloudinary folder; the product form then
// references the returned url + publicId (verified again on save).
uploadsRouter.post('/product-images', acceptFiles('files', ['jpeg', 'png', 'webp'], 8), async (req, res) => {
  const seller = await requireSeller(req.user!.id);
  const files = req.files as Express.Multer.File[];
  const images = await Promise.all(
    files.map((f) => uploadBuffer(f.buffer, { folder: sellerFolder(seller.id, 'products') })),
  );
  res.status(201).json({ success: true, data: { images } });
});
