import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { cardSelect, toCard, visibleProduct } from '../storefront/storefront.service.js';

async function ensureWishlist(userId: string) {
  const profile = await prisma.buyerProfile.upsert({ where: { userId }, create: { userId }, update: {} });
  return prisma.wishlist.upsert({ where: { buyerId: profile.id }, create: { buyerId: profile.id }, update: {} });
}

export async function listWishlist(userId: string) {
  const wl = await ensureWishlist(userId);
  const rows = await prisma.wishlistItem.findMany({
    where: { wishlistId: wl.id, product: visibleProduct },
    orderBy: { createdAt: 'desc' },
    select: { product: { select: cardSelect } },
  });
  const items = rows.map((r) => toCard(r.product));
  return { items, ids: items.map((i) => i.id) };
}

export async function addToWishlist(userId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { AND: [visibleProduct, { id: productId }] }, select: { id: true } });
  if (!product) throw AppError.notFound('Product not found');
  const wl = await ensureWishlist(userId);
  await prisma.wishlistItem.upsert({
    where: { wishlistId_productId: { wishlistId: wl.id, productId } },
    create: { wishlistId: wl.id, productId },
    update: {},
  });
  return listWishlist(userId);
}

export async function removeFromWishlist(userId: string, productId: string) {
  const wl = await ensureWishlist(userId);
  await prisma.wishlistItem.deleteMany({ where: { wishlistId: wl.id, productId } });
  return listWishlist(userId);
}
