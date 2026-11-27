import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { API_PREFIX } from '@shopsphere/shared-config';
import { env, isProd } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { REFRESH_TTL_MS } from '../../utils/security.js';
import * as auth from './auth.service.js';

export const REFRESH_COOKIE = 'ss_rt';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  // Deployed behind the site's own /api proxy the cookie is first-party, so 'lax' works (COOKIE_SAMESITE=lax).
  // Calling the API's domain directly from another site needs 'none' (and Secure), the production default.
  sameSite: env.COOKIE_SAMESITE ?? (isProd ? 'none' : 'lax'),
  path: `${API_PREFIX}/auth`,
};

const ctxOf = (req: Request): auth.SessionContext => ({
  ip: req.ip ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

function sendSession(res: Response, result: auth.AuthResult, status = 200) {
  res.cookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOptions, maxAge: REFRESH_TTL_MS });
  res.status(status).json({
    success: true,
    data: { accessToken: result.accessToken, user: result.user },
  });
}

/** Cookie-authenticated endpoints only accept requests from the configured web origins. */
function assertTrustedOrigin(req: Request) {
  const origin = req.headers.origin;
  if (origin && !env.CORS_ORIGIN.split(',').includes(origin)) {
    throw AppError.forbidden('Origin not allowed');
  }
}

export const registerBuyer: RequestHandler = async (req, res) => {
  sendSession(res, await auth.registerBuyer(req.body, ctxOf(req)), 201);
};

export const registerSeller: RequestHandler = async (req, res) => {
  sendSession(res, await auth.registerSeller(req.body, ctxOf(req)), 201);
};

export const login: RequestHandler = async (req, res) => {
  sendSession(res, await auth.login(req.body, ctxOf(req)));
};

export const refresh: RequestHandler = async (req, res) => {
  assertTrustedOrigin(req);
  sendSession(res, await auth.refresh(req.cookies?.[REFRESH_COOKIE], ctxOf(req)));
};

export const logout: RequestHandler = async (req, res) => {
  assertTrustedOrigin(req);
  await auth.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.json({ success: true, data: { loggedOut: true } });
};

export const logoutAll: RequestHandler = async (req, res) => {
  await auth.logoutAll(req.user!.id);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.json({ success: true, data: { loggedOut: true } });
};

export const me: RequestHandler = async (req, res) => {
  res.json({ success: true, data: { user: await auth.getCurrentUser(req.user!.id) } });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  const token = await auth.requestPasswordReset(req.body.email);
  res.json({
    success: true,
    data: {
      message: 'If an account exists for this email, a reset link has been sent.',
      // Demo simulation only: no email provider is connected.
      ...(env.DEMO_MODE && token ? { demoResetToken: token } : {}),
    },
  });
};

export const resetPassword: RequestHandler = async (req, res) => {
  await auth.resetPassword(req.body.token, req.body.password);
  res.json({ success: true, data: { message: 'Password updated. Please sign in.' } });
};
