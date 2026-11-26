import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { isProd } from '../config/env.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) =>
  next(AppError.notFound('Route not found'));

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.flatten() },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  const status = typeof err?.status === 'number' ? err.status : 500;
  if (status >= 500) logger.error({ err, reqId: req.id }, 'Unhandled error');
  res.status(status).json({
    success: false,
    error: {
      code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      message: status === 500 && isProd ? 'Something went wrong' : (err?.message ?? 'Error'),
    },
  });
};
