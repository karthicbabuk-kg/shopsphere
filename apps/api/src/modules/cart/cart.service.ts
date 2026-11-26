import { MAX_QTY_PER_LINE } from '@shopsphere/shared-validation';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { getSettings } from '../settings/settings.service.js';
import { visibleProduct } from '../storefront/storefront.service.js';
import { computeCart } from './cart.calc.js';

type Issue = 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT';

const itemInclude = {
  variant: {
    select: {
      id: true,
      sku: true,
      label: true,
      pricePaise: true,
      mrpPaise: true,
      active: true,
      deletedAt: true,
      inventory: { select: { available: true } },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          pricePaise: true,
          mrpPaise: true,
          status: true,
          approval: true,
          deletedAt: true,
          category: { select: { active: true } },
          images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
          seller: { select: { id: true, status: true, deletedAt: true, store: { select: { name: true, slug: true } } } },
        },
      },
    },
  },
} as const;

async function ensureCart(userId: string) {
  return prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function getCart(userId: string) {
  const cart = await ensureCart(userId);
  const [items, settings] = await Promise.all([
    prisma.cartItem.findMany({ where: { cartId: cart.id }, orderBy: { createdAt: 'asc' }, include: itemInclude }),
    getSettings(),
  ]);

  const lines = items.map((it) => {
    const v = it.variant;
    const p = v.product;
    const visible =
      !v.deletedAt && v.active && !p.deletedAt && p.status === 'ACTIVE' && p.approval === 'APPROVED' &&
      p.category.active && p.seller.status === 'APPROVED' && !p.seller.deletedAt;
    const available = visible ? (v.inventory?.available ?? 0) : 0;
    const issue: Issue | null = !visible ? 'UNAVAILABLE' : available === 0 ? 'OUT_OF_STOCK' : available < it.quantity ? 'INSUFFICIENT' : null;
    const unit = v.pricePaise ?? p.pricePaise;
    const mrp = v.mrpPaise ?? p.mrpPaise;
    return {
      id: it.id,
      variantId: v.id,
      productId: p.id,
      slug: p.slug,
      name: p.name,
      label: v.label,
      sku: v.sku,
      image: p.images[0]?.url ?? null,
      unitPricePaise: unit,
      mrpPaise: mrp,
      quantity: it.quantity,
      lineTotalPaise: unit * it.quantity,
      available,
      maxQty: Math.min(available, MAX_QTY_PER_LINE),
      issue,
      sellerId: p.seller.id,
      store: p.seller.store,
    };
  });

  // Lines with problems stay visible so the buyer can fix them, but never count towards totals.
  const valid = lines.filter((l) => !l.issue);
  const totals = computeCart(valid, settings);
  const groups = [...new Set(lines.map((l) => l.sellerId))].map((sellerId) => {
    const own = lines.filter((l) => l.sellerId === sellerId);
    const t = totals.perSeller.find((s) => s.sellerId === sellerId);
    return {
      sellerId,
      store: own[0]!.store,
      items: own,
      subtotalPaise: t?.subtotalPaise ?? 0,
      deliveryPaise: t?.deliveryPaise ?? 0,
      freeDelivery: t?.freeDelivery ?? false,
      remainingForFreePaise: t?.remainingForFreePaise ?? settings.freeDeliveryThresholdPaise,
    };
  });

  return {
    groups,
    totals: { ...totals, perSeller: undefined },
    // Header badge: every unit in the cart, including lines that currently have issues.
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    hasIssues: lines.some((l) => l.issue),
    canCheckout: valid.length > 0 && !lines.some((l) => l.issue) && totals.subtotalPaise >= settings.minOrderPaise,
    minOrderPaise: settings.minOrderPaise,
    freeDeliveryThresholdPaise: settings.freeDeliveryThresholdPaise,
  };
}

/** Loads a variant only if a buyer may purchase it, with its live stock. */
async function purchasableVariant(variantId: string) {
  const v = await prisma.productVariant.findFirst({
    where: { id: variantId, deletedAt: null, active: true, product: visibleProduct },
    select: { id: true, inventory: { select: { available: true } } },
  });
  if (!v) throw AppError.notFound('This item is no longer available');
  return { id: v.id, available: v.inventory?.available ?? 0 };
}

function assertQuantity(wanted: number, available: number) {
  if (available === 0) throw AppError.conflict('This item is out of stock', { available });
  const limit = Math.min(available, MAX_QTY_PER_LINE);
  if (wanted > limit) {
    throw AppError.conflict(
      available < MAX_QTY_PER_LINE ? `Only ${available} left in stock` : `You can buy at most ${MAX_QTY_PER_LINE} of this item at once`,
      { available, maxQty: limit },
    );
  }
}

export async function addItem(userId: string, variantId: string, quantity: number) {
  const cart = await ensureCart(userId);
  const variant = await purchasableVariant(variantId);
  const existing = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
  const next = (existing?.quantity ?? 0) + quantity;
  assertQuantity(next, variant.available);
  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    create: { cartId: cart.id, variantId, quantity: next },
    update: { quantity: next },
  });
  return getCart(userId);
}

export async function setQuantity(userId: string, itemId: string, quantity: number) {
  const cart = await ensureCart(userId);
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
  if (!item) throw AppError.notFound('Cart item not found');
  const variant = await purchasableVariant(item.variantId);
  assertQuantity(quantity, variant.available);
  await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
  return getCart(userId);
}

export async function removeItem(userId: string, itemId: string) {
  const cart = await ensureCart(userId);
  // Scoped by cart so one buyer can never delete another buyer's line.
  const res = await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  if (res.count === 0) throw AppError.notFound('Cart item not found');
  return getCart(userId);
}

export async function clearCart(userId: string) {
  const cart = await ensureCart(userId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  return getCart(userId);
}
