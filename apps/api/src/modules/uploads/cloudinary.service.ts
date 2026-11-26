import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export interface UploadedAsset {
  url: string;
  publicId: string;
  bytes: number;
  width?: number;
  height?: number;
}

export const isCloudinaryConfigured = () =>
  !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

function ensureConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new AppError(
      503,
      'UPLOADS_NOT_CONFIGURED',
      'Image uploads are not configured on this server (missing Cloudinary credentials).',
    );
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/** Folder that all of one seller's assets live under; used to verify ownership of references. */
export const sellerFolder = (sellerId: string, kind: 'products' | 'store' | 'documents') =>
  `shopsphere/sellers/${sellerId}/${kind}`;

export function uploadBuffer(
  buffer: Buffer,
  opts: { folder: string; resourceType?: 'image' | 'raw' },
): Promise<UploadedAsset> {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: opts.folder,
        resource_type: opts.resourceType ?? 'image',
        // Normalise on the CDN so we never serve oversized originals.
        ...(opts.resourceType === 'raw' ? {} : { transformation: [{ width: 2000, height: 2000, crop: 'limit', quality: 'auto', fetch_format: 'auto' }] }),
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
        });
      },
    );
    stream.end(buffer);
  });
}

/** Best-effort cleanup; failures are logged, never surfaced to the user. */
export async function destroyAssets(publicIds: string[], resourceType: 'image' | 'raw' = 'image') {
  if (publicIds.length === 0 || !isCloudinaryConfigured()) return;
  try {
    ensureConfigured();
    await cloudinary.api.delete_resources(publicIds, { resource_type: resourceType });
  } catch (err) {
    logger.warn({ err, count: publicIds.length }, 'Failed to delete Cloudinary assets');
  }
}

/** An asset reference is trusted only if it points at our cloud and the caller's own folder. */
export function assertOwnedAsset(
  ref: { url: string; publicId: string },
  sellerId: string,
  kind: 'products' | 'store' | 'documents',
) {
  const prefix = `${sellerFolder(sellerId, kind)}/`;
  const cloud = env.CLOUDINARY_CLOUD_NAME;
  const urlOk = !!cloud && ref.url.startsWith(`https://res.cloudinary.com/${cloud}/`);
  if (!urlOk || !ref.publicId.startsWith(prefix) || ref.publicId.includes('..')) {
    throw AppError.badRequest('Invalid image reference. Upload images through the upload endpoint first.');
  }
}
