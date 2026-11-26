import type { RequestHandler } from 'express';
import type { Role } from '@shopsphere/shared-types';
import { AppError } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/security.js';

export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Requires a valid Bearer access token. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const claims = token ? verifyAccessToken(token) : null;
  if (!claims) return next(AppError.unauthorized());
  req.user = { id: claims.sub, role: claims.role };
  next();
};

/** Use after `authenticate`. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
