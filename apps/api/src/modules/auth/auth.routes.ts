import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  forgotPasswordSchema,
  loginSchema,
  registerBuyerSchema,
  registerSellerSchema,
  resetPasswordSchema,
} from '@shopsphere/shared-validation';
import { env } from '../../config/env.js';
import { authenticate } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as c from './auth.controller.js';

export const authRouter = Router();

// Credential endpoints get a tighter limit than the global one in production only, so local
// development and automated browser tests are not locked out by their own traffic.
const strictLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.NODE_ENV === 'production' ? 30 : 10_000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } },
});

authRouter.post('/register', strictLimiter, validateBody(registerBuyerSchema), c.registerBuyer);
authRouter.post('/register-seller', strictLimiter, validateBody(registerSellerSchema), c.registerSeller);
authRouter.post('/login', strictLimiter, validateBody(loginSchema), c.login);
authRouter.post('/refresh', c.refresh);
authRouter.post('/logout', c.logout);
authRouter.post('/logout-all', authenticate, c.logoutAll);
authRouter.get('/me', authenticate, c.me);
authRouter.post('/forgot-password', strictLimiter, validateBody(forgotPasswordSchema), c.forgotPassword);
authRouter.post('/reset-password', strictLimiter, validateBody(resetPasswordSchema), c.resetPassword);
