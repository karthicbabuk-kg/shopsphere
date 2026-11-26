import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';

/** Resolves the caller's seller record. Ownership always starts from the authenticated user. */
export async function requireSeller(userId: string) {
  const seller = await prisma.seller.findFirst({ where: { userId, deletedAt: null } });
  if (!seller) throw AppError.forbidden('Seller profile not found');
  return seller;
}
