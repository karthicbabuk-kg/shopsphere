import multer from 'multer';
import type { RequestHandler } from 'express';
import { AppError } from '../../utils/errors.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Kind = 'jpeg' | 'png' | 'webp' | 'pdf';

/** Detects the real file type from magic bytes; the client-declared MIME type is not trusted. */
export function sniffType(b: Buffer): Kind | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (b.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  return null;
}

const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 8 },
});

function translateMulterError(err: unknown) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return AppError.badRequest('Each file must be 5 MB or smaller');
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return AppError.badRequest('Too many files in one upload');
    }
    return AppError.badRequest(err.message);
  }
  return err;
}

/** Accepts `field` as multipart file(s) and rejects anything whose content is not an allowed type. */
export const acceptFiles =
  (field: string, allowed: Kind[], maxFiles: number): RequestHandler =>
  (req, res, next) => {
    memory.array(field, maxFiles)(req, res, (err) => {
      if (err) return next(translateMulterError(err));
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) return next(AppError.badRequest('No file received'));
      for (const f of files) {
        const kind = sniffType(f.buffer);
        if (!kind || !allowed.includes(kind)) {
          return next(AppError.badRequest(`"${f.originalname}" is not an allowed file type (${allowed.join(', ')})`));
        }
      }
      next();
    });
  };
