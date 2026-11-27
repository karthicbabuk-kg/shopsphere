import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Tighter limits for endpoints that change state or can be used to guess values (coupon codes).
 * Like the auth limiter they only bite in production, so local development and the automated
 * browser tests are not blocked by their own traffic.
 */
const make = (windowMs: number, prodLimit: number, message: string) =>
  rateLimit({
    windowMs,
    limit: env.NODE_ENV === 'production' ? prodLimit : 100_000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message } },
  });

/** Placing orders: a handful per minute is plenty for a person. */
export const orderLimiter = make(60_000, 10, 'Too many order attempts. Please wait a minute.');
/** Coupon quotes can be abused to guess codes, so they are limited more tightly. */
export const quoteLimiter = make(60_000, 30, 'Too many checkout requests. Please slow down.');
/** Review writes. */
export const reviewLimiter = make(60_000, 10, 'Too many review changes. Please slow down.');
