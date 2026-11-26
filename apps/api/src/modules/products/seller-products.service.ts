import type { ProductInput, SellerProductQuery } from '@shopsphere/shared-validation';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { pageArgs, pageMeta } from '../../utils/pagination.js';
import { uniqueSlug } from '../../utils/slug.js';
import { createInventoryWithOpening } from '../inventory/inventory.service.js';
import { requireSeller } from '../sellers/require-seller.js';
import { assertOwnedAsset, destroyAssets } from '../uploads/cloudinary.service.js';

const detailInclude = {
  images: { orderBy: { position: 'asc' } },
  attributes: { orderBy: { position: 'asc' } },
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  variants: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { inventory: { select: { available: true, reserved: true, sold: true, reorderLevel: true } } },
  },
} satisfies Prisma.ProductInclude;

async function loadOwnedProduct(sellerId: string, productId: string) {
  // Cross-seller access is indistinguishable from "not found" on purpose.
  const product = await prisma.product.findFirst({
    where: { id: productId, sellerId, deletedAt: null },
    include: detailInclude,
  });
  if (!product) throw AppError.notFound('Product not found');
  return product;
}

async function validateTaxonomy(input: ProductInput) {
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, active: true } });
  if (!category) throw AppError.badRequest('Selected category does not exist');
  if (input.brandId) {
    const brand = await prisma.brand.findFirst({ where: { id: input.brandId, active: true } });
    if (!brand) throw AppError.badRequest('Selected brand does not exist');
  }
}

async function assertSkusFree(skus: string[], ownVariantIds: string[] = []) {
  const taken = await prisma.productVariant.findMany({
    where: { sku: { in: skus }, id: { notIn: ownVariantIds } },
    select: { sku: true },
  });
  if (taken.length) {
    throw AppError.conflict(`SKU already in use: ${taken.map((t) => t.sku).join(', ')}`, {
      skus: taken.map((t) => t.sku),
    });
  }
}

async function defaultWarehouseId(tx: Prisma.TransactionClient, sellerId: string) {
  const existing = await tx.warehouse.findFirst({
    where: { sellerId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (existing) return existing.id;
  return (await tx.warehouse.create({ data: { sellerId, name: 'Main warehouse', isDefault: true } })).id;
}

function assertCanSubmit(sellerStatus: string, wantActive: boolean) {
  if (wantActive && sellerStatus !== 'APPROVED') {
    throw AppError.forbidden('Your store must be approved by an administrator before you can submit products');
  }
}

export async function createProduct(userId: string, input: ProductInput) {
  const seller = await requireSeller(userId);
  assertCanSubmit(seller.status, input.status === 'ACTIVE');
  await validateTaxonomy(input);
  input.images.forEach((i) => assertOwnedAsset(i, seller.id, 'products'));
  await assertSkusFree(input.variants.map((v) => v.sku));

  const slug = await uniqueSlug(input.name, async (s) => !!(await prisma.product.findUnique({ where: { slug: s } })));

  try {
    const id = await prisma.$transaction(async (tx) => {
      const warehouseId = await defaultWarehouseId(tx, seller.id);
      const product = await tx.product.create({
        data: {
          sellerId: seller.id,
          categoryId: input.categoryId,
          brandId: input.brandId ?? null,
          name: input.name,
          slug,
          description: input.description,
          mrpPaise: input.mrpPaise,
          pricePaise: input.pricePaise,
          status: input.status,
          approval: 'PENDING',
          images: { create: input.images.map((img, position) => ({ ...img, position })) },
          attributes: { create: input.attributes.map((a, position) => ({ ...a, position })) },
        },
      });
      for (const v of input.variants) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: v.sku,
            label: v.label,
            optionValues: v.optionValues,
            pricePaise: v.pricePaise ?? null,
            mrpPaise: v.mrpPaise ?? null,
          },
        });
        await createInventoryWithOpening(tx, {
          variantId: variant.id,
          warehouseId,
          sellerId: seller.id,
          openingStock: v.openingStock,
          reorderLevel: v.reorderLevel,
          userId,
          referenceNo: `OPEN-${v.sku}`,
        });
      }
      return product.id;
    });
    await audit({ actorId: userId, action: 'product.create', entity: 'product', entityId: id, meta: { status: input.status } });
    return loadOwnedProduct(seller.id, id);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw AppError.conflict('A SKU or product slug is already in use');
    }
    throw e;
  }
}

export async function updateProduct(userId: string, productId: string, input: ProductInput) {
  const seller = await requireSeller(userId);
  const existing = await loadOwnedProduct(seller.id, productId);
  if (existing.approval === 'SUSPENDED') {
    throw AppError.forbidden('This product was suspended by an administrator and cannot be edited');
  }
  assertCanSubmit(seller.status, input.status === 'ACTIVE');
  await validateTaxonomy(input);
  input.images.forEach((i) => assertOwnedAsset(i, seller.id, 'products'));

  const ownVariantIds = existing.variants.map((v) => v.id);
  for (const v of input.variants) {
    if (v.id && !ownVariantIds.includes(v.id)) throw AppError.badRequest('Unknown variant in request');
  }
  await assertSkusFree(input.variants.map((v) => v.sku), ownVariantIds);

  // Changes to what buyers read or see send the product back through review.
  const sameImages =
    existing.images.length === input.images.length &&
    existing.images.every((img, i) => img.publicId === input.images[i]?.publicId);
  const materialChange =
    existing.name !== input.name ||
    existing.description !== input.description ||
    existing.categoryId !== input.categoryId ||
    (existing.brandId ?? null) !== (input.brandId ?? null) ||
    !sameImages;
  const submitting = input.status === 'ACTIVE';
  const needsReview =
    existing.approval === 'REJECTED' ||
    (existing.approval === 'APPROVED' && materialChange) ||
    (submitting && existing.status !== 'ACTIVE');
  const approval = needsReview ? 'PENDING' : existing.approval;

  const keepIds = new Set(input.variants.flatMap((v) => (v.id ? [v.id] : [])));
  const removed = existing.variants.filter((v) => !keepIds.has(v.id));
  const blocked = removed.find((v) => (v.inventory?.reserved ?? 0) > 0);
  if (blocked) {
    throw AppError.conflict(`Cannot remove SKU ${blocked.sku}: units are reserved for open orders`);
  }

  const removedImageIds = existing.images
    .filter((img) => !input.images.some((n) => n.publicId === img.publicId))
    .map((img) => img.publicId)
    .filter((p): p is string => !!p);

  await prisma.$transaction(async (tx) => {
    const warehouseId = await defaultWarehouseId(tx, seller.id);
    await tx.product.update({
      where: { id: productId },
      data: {
        categoryId: input.categoryId,
        brandId: input.brandId ?? null,
        name: input.name,
        description: input.description,
        mrpPaise: input.mrpPaise,
        pricePaise: input.pricePaise,
        status: input.status,
        approval,
        ...(approval === 'PENDING' ? { rejectionReason: null } : {}),
      },
    });
    await tx.productImage.deleteMany({ where: { productId } });
    await tx.productImage.createMany({
      data: input.images.map((img, position) => ({ productId, url: img.url, publicId: img.publicId, position })),
    });
    await tx.productAttribute.deleteMany({ where: { productId } });
    await tx.productAttribute.createMany({
      data: input.attributes.map((a, position) => ({ productId, key: a.key, value: a.value, position })),
    });

    for (const v of removed) {
      // Soft removal keeps historical order items and the immutable stock ledger intact.
      await tx.productVariant.update({ where: { id: v.id }, data: { active: false, deletedAt: new Date() } });
    }
    for (const v of input.variants) {
      if (v.id) {
        await tx.productVariant.update({
          where: { id: v.id },
          data: {
            sku: v.sku,
            label: v.label,
            optionValues: v.optionValues,
            pricePaise: v.pricePaise ?? null,
            mrpPaise: v.mrpPaise ?? null,
          },
        });
        // Stock quantities are changed only through inventory operations; reorder level is a setting.
        await tx.inventory.updateMany({ where: { variantId: v.id }, data: { reorderLevel: v.reorderLevel } });
      } else {
        const created = await tx.productVariant.create({
          data: {
            productId,
            sku: v.sku,
            label: v.label,
            optionValues: v.optionValues,
            pricePaise: v.pricePaise ?? null,
            mrpPaise: v.mrpPaise ?? null,
          },
        });
        await createInventoryWithOpening(tx, {
          variantId: created.id,
          warehouseId,
          sellerId: seller.id,
          openingStock: v.openingStock,
          reorderLevel: v.reorderLevel,
          userId,
          referenceNo: `OPEN-${v.sku}`,
        });
      }
    }
  });

  await destroyAssets(removedImageIds);
  await audit({
    actorId: userId,
    action: 'product.update',
    entity: 'product',
    entityId: productId,
    meta: { status: input.status, sentForReview: approval === 'PENDING' && existing.approval !== 'PENDING' },
  });
  return loadOwnedProduct(seller.id, productId);
}

export async function archiveProduct(userId: string, productId: string) {
  const seller = await requireSeller(userId);
  const res = await prisma.product.updateMany({
    where: { id: productId, sellerId: seller.id, deletedAt: null, status: { not: 'ARCHIVED' } },
    data: { status: 'ARCHIVED' },
  });
  // Throws 404 for another seller's product; idempotent when it is already archived.
  const product = await loadOwnedProduct(seller.id, productId);
  if (res.count > 0) {
    await audit({ actorId: userId, action: 'product.archive', entity: 'product', entityId: productId });
  }
  return product;
}

export async function listSellerProducts(userId: string, q: SellerProductQuery) {
  const seller = await requireSeller(userId);
  const where: Prisma.ProductWhereInput = {
    sellerId: seller.id,
    deletedAt: null,
    ...(q.status ? { status: q.status } : {}),
    ...(q.approval ? { approval: q.approval } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: q.q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      ...pageArgs(q),
      select: {
        id: true,
        name: true,
        slug: true,
        pricePaise: true,
        mrpPaise: true,
        status: true,
        approval: true,
        rejectionReason: true,
        updatedAt: true,
        category: { select: { name: true } },
        images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
        variants: {
          where: { deletedAt: null },
          select: { sku: true, inventory: { select: { available: true, reorderLevel: true } } },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);
  return {
    items: items.map(({ variants, images, ...p }) => ({
      ...p,
      image: images[0]?.url ?? null,
      skuCount: variants.length,
      skus: variants.map((v) => v.sku),
      stock: variants.reduce((n, v) => n + (v.inventory?.available ?? 0), 0),
      lowStock: variants.some((v) => v.inventory && v.inventory.available <= v.inventory.reorderLevel),
    })),
    meta: pageMeta(q, total),
  };
}

export async function getSellerProduct(userId: string, productId: string) {
  const seller = await requireSeller(userId);
  return loadOwnedProduct(seller.id, productId);
}
