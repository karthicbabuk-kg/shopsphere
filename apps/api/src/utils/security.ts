import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@shopsphere/shared-types';
import { env } from '../config/env.js';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_SECONDS = 15 * 60;

const BCRYPT_COST = env.NODE_ENV === 'test' ? 4 : 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export interface AccessClaims {
  sub: string;
  role: Role;
}

export const signAccessToken = (claims: AccessClaims) =>
  jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL_SECONDS, algorithm: 'HS256' });

export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (typeof p === 'string' || !p.sub || !p['role']) return null;
    return { sub: p.sub, role: p['role'] as Role };
  } catch {
    return null;
  }
}

/** Refresh tokens are opaque random strings; only their SHA-256 hash is stored. */
export const newRefreshToken = () => randomBytes(48).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/**
 * Password reset (demo): a short-lived signed token bound to a fingerprint of the current
 * password hash, so it stops working as soon as the password changes (single use).
 */
const fingerprint = (passwordHash: string) =>
  createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);

export const signResetToken = (userId: string, passwordHash: string) =>
  jwt.sign({ sub: userId, fp: fingerprint(passwordHash), purpose: 'reset' }, env.JWT_REFRESH_SECRET, {
    expiresIn: RESET_TTL_SECONDS,
  });

export function verifyResetToken(token: string): { userId: string; fp: string } | null {
  try {
    const p = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (typeof p === 'string' || p['purpose'] !== 'reset' || !p.sub) return null;
    return { userId: p.sub, fp: String(p['fp']) };
  } catch {
    return null;
  }
}

export const resetFingerprintMatches = (fp: string, passwordHash: string) =>
  fp === fingerprint(passwordHash);
