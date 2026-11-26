import { randomBytes } from 'node:crypto';
import type {
  LoginInput,
  RegisterBuyerInput,
  RegisterSellerInput,
} from '@shopsphere/shared-validation';
import type { Role, SellerStatus } from '@shopsphere/shared-types';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import {
  REFRESH_TTL_MS,
  hashPassword,
  hashToken,
  newRefreshToken,
  resetFingerprintMatches,
  signAccessToken,
  signResetToken,
  verifyPassword,
  verifyResetToken,
} from '../../utils/security.js';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
/** A rotated refresh token reused within this window is treated as a client race, not theft. */
const REUSE_GRACE_MS = 10_000;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  sellerStatus?: SellerStatus;
}

export interface SessionContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

type UserWithSeller = Prisma.UserGetPayload<{ include: { seller: { select: { status: true } } } }>;

function toPublicUser(u: UserWithSeller): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    ...(u.seller ? { sellerStatus: u.seller.status } : {}),
  };
}

const withSeller = { seller: { select: { status: true } } } as const;

async function issueSession(
  user: UserWithSeller,
  ctx: SessionContext,
  familyId: string = crypto.randomUUID(),
): Promise<AuthResult> {
  const refreshToken = newRefreshToken();
  await prisma.userSession.create({
    data: {
      userId: user.id,
      familyId,
      refreshTokenHash: hashToken(refreshToken),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent?.slice(0, 255) ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken,
    user: toPublicUser(user),
  };
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'store';

async function assertEmailFree(email: string) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw AppError.conflict('An account with this email already exists');
}

function rethrowUnique(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    throw AppError.conflict('An account with this email already exists');
  }
  throw e;
}

export async function registerBuyer(input: RegisterBuyerInput, ctx: SessionContext) {
  await assertEmailFree(input.email);
  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        name: input.name,
        phone: input.phone ?? null,
        role: 'BUYER',
        buyerProfile: { create: { wishlist: { create: {} } } },
        cart: { create: {} },
      },
      include: withSeller,
    });
    await audit({ actorId: user.id, action: 'auth.register', entity: 'user', entityId: user.id, ip: ctx.ip });
    return issueSession(user, ctx);
  } catch (e) {
    return rethrowUnique(e);
  }
}

export async function registerSeller(input: RegisterSellerInput, ctx: SessionContext) {
  await assertEmailFree(input.email);
  const baseSlug = slugify(input.storeName);
  const taken = await prisma.sellerStore.findUnique({ where: { slug: baseSlug }, select: { id: true } });
  const slug = taken ? `${baseSlug}-${randomBytes(3).toString('hex')}` : baseSlug;
  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        name: input.name,
        phone: input.phone,
        role: 'SELLER',
        seller: {
          create: {
            businessName: input.businessName,
            gstin: input.gstin ?? null,
            status: 'PENDING',
            store: {
              create: {
                name: input.storeName,
                slug,
                description: input.storeDescription ?? null,
                contactEmail: input.email,
                contactPhone: input.phone,
              },
            },
            warehouses: { create: { name: 'Main warehouse', isDefault: true } },
          },
        },
      },
      include: withSeller,
    });
    await audit({ actorId: user.id, action: 'seller.register', entity: 'user', entityId: user.id, ip: ctx.ip });
    return issueSession(user, ctx);
  } catch (e) {
    return rethrowUnique(e);
  }
}

// Used to keep response time similar whether or not the email exists.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword('not-a-real-password'));

export async function login(input: LoginInput, ctx: SessionContext): Promise<AuthResult> {
  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
    include: withSeller,
  });

  if (!user) {
    await verifyPassword(input.password, await getDummyHash());
    throw AppError.unauthorized('Invalid email or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes.');
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    if (lock) {
      await audit({ actorId: user.id, action: 'auth.locked', entity: 'user', entityId: user.id, ip: ctx.ip });
    }
    throw AppError.unauthorized('Invalid email or password');
  }

  if (user.status !== 'ACTIVE') throw AppError.forbidden('This account has been suspended');

  if (user.failedLogins > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  }
  await audit({ actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, ip: ctx.ip });
  return issueSession(user, ctx);
}

/** Rotates the refresh token. Presenting an already-rotated token revokes the whole family. */
export async function refresh(rawToken: string | undefined, ctx: SessionContext): Promise<AuthResult> {
  if (!rawToken) throw AppError.unauthorized('Session expired');
  const session = await prisma.userSession.findUnique({
    where: { refreshTokenHash: hashToken(rawToken) },
    include: { user: { include: withSeller } },
  });
  if (!session) throw AppError.unauthorized('Session expired');

  if (session.revokedAt) {
    if (Date.now() - session.revokedAt.getTime() > REUSE_GRACE_MS) {
      await prisma.userSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await audit({
        actorId: session.userId,
        action: 'auth.refresh_reuse_detected',
        entity: 'user_session',
        entityId: session.id,
        ip: ctx.ip,
      });
    }
    throw AppError.unauthorized('Session expired');
  }
  if (session.expiresAt < new Date()) throw AppError.unauthorized('Session expired');
  if (session.user.deletedAt || session.user.status !== 'ACTIVE') throw AppError.unauthorized('Session expired');

  // Atomic claim: only one concurrent request can rotate this token.
  const claimed = await prisma.userSession.updateMany({
    where: { id: session.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count === 0) throw AppError.unauthorized('Session expired');

  return issueSession(session.user, ctx, session.familyId);
}

export async function logout(rawToken: string | undefined) {
  if (!rawToken) return;
  await prisma.userSession.updateMany({
    where: { refreshTokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string) {
  await prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, include: withSeller });
  if (!user) throw AppError.unauthorized();
  return toPublicUser(user);
}

/** Demo simulation: no email is sent; the token is returned so the flow can be shown end to end. */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) return null;
  await audit({ actorId: user.id, action: 'auth.reset_requested', entity: 'user', entityId: user.id });
  return signResetToken(user.id, user.passwordHash);
}

export async function resetPassword(token: string, newPassword: string) {
  const claims = verifyResetToken(token);
  if (!claims) throw AppError.badRequest('This reset link is invalid or has expired');
  const user = await prisma.user.findFirst({ where: { id: claims.userId, deletedAt: null } });
  if (!user || !resetFingerprintMatches(claims.fp, user.passwordHash)) {
    throw AppError.badRequest('This reset link is invalid or has expired');
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), failedLogins: 0, lockedUntil: null },
    }),
    prisma.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ actorId: user.id, action: 'auth.password_reset', entity: 'user', entityId: user.id });
}
