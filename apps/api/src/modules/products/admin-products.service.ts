import type { AdminProductQuery, ProductAction } from '@shopsphere/shared-validation';
import type { ApprovalStatus } from '@shopsphere/shared-types';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { pageArgs, pageMeta } from '../../utils/pagination.js';
import { notify } from '../notifications/notifications.service.js';

const TRANSITIONS: Record<ProductAction, { from: ApprovalStatus[]; to: ApprovalStatus; needsReason: boolean }> = {
  approve: { from: ['PENDING'], to: 'APPROVED', needsReason: false },
  reject: { from: ['PENDING'], to: 'REJECTED', needsReason: true },
  suspend: { from: ['APPROVED'], to: 'SUSPENDED', needsReason: true },
  reinstate: { from: ['SUSPENDED'], to: 'APPROVED', needsReason: false },
};

const MESSAGES: Record<ProductAction, { title: (n: string) => string; body: (r?: string) => string }> = {
  approve: { title: (n) => `"${n}" is now live`, body: () => 'Buyers can find and purchase this product.' },
  reject: { title: (n) => `"${n}" was not approved`, body: (r) => `Reason: ${r}. Edit the product and resubmit.` },
  suspend: { title: (n) => `"${n}" was suspended`, body: (r) => `Reason: ${r}` },
  reinstate: { title: (n) => `"${n}" was reinstated`, body: () => 'The product is visible to buyers again.' },
};

export async function listProducts(q: AdminProductQuery) {
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    // Drafts are private to the seller; admins only see what has been submitted.
    status: q.status ?? { not: 'DRAFT' },
    ...(q.approval ? { approval: q.approval } : {}),
    ...(q.sellerId ? { sellerId: q.sellerId } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: q.q, mode: 'insensitive' } } } },
            { seller: { store: { name: { contains: q.q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const [rows, total, groups] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      ...pageArgs(q),
      select: {
        id: true,
        name: true,
        pricePaise: true,
        status: true,
        approval: true,
        updatedAt: true,
        category: { select: { name: true } },
        brand: { select: { name: true } },
        seller: { select: { id: true, status: true, store: { select: { name: true } } } },
        images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
      },
    }),
    prisma.product.count({ where }),
    prisma.product.groupBy({
      by: ['approval'],
      where: { deletedAt: null, status: { not: 'DRAFT' } },
      _count: true,
    }),
  ]);
  return {
    items: rows.map(({ images, ...p }) => ({ ...p, image: images[0]?.url ?? null })),
    approvalCounts: Object.fromEntries(groups.map((g) => [g.approval, g._count])),
    meta: pageMeta(q, total),
  };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null, status: { not: 'DRAFT' } },
    include: {
      images: { orderBy: { position: 'asc' } },
      attributes: { orderBy: { position: 'asc' } },
      category: { select: { name: true } },
      brand: { select: { name: true } },
      seller: { select: { id: true, status: true, businessName: true, store: { select: { name: true } } } },
      variants: {
        where: { deletedAt: null },
        include: { inventory: { select: { available: true, reserved: true, sold: true } } },
      },
    },
  });
  if (!product) throw AppError.notFound('Product not found');
  const history = await prisma.auditLog.findMany({
    where: { entity: 'product', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, action: true, meta: true, createdAt: true, actor: { select: { name: true } } },
  });
  return { ...product, history };
}

export async function applyAction(
  productId: string,
  action: ProductAction,
  actorId: string,
  reason: string | undefined,
  ip?: string | null,
) {
  const rule = TRANSITIONS[action];
  if (rule.needsReason && !reason) throw AppError.badRequest('A reason is required');

  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null, status: { not: 'DRAFT' } },
    select: { id: true, name: true, approval: true, status: true, seller: { select: { userId: true } } },
  });
  if (!product) throw AppError.notFound('Product not found');
  if (action === 'approve' && product.status !== 'ACTIVE') {
    throw AppError.conflict('Only submitted (active) products can be approved');
  }

  const res = await prisma.product.updateMany({
    where: { id: productId, approval: { in: rule.from } },
    data: { approval: rule.to, rejectionReason: rule.needsReason ? reason! : null },
  });
  if (res.count === 0) {
    throw AppError.conflict(`Cannot ${action} a product whose approval is ${product.approval}`, {
      currentApproval: product.approval,
    });
  }

  await Promise.all([
    audit({
      actorId,
      action: `product.${action}`,
      entity: 'product',
      entityId: productId,
      meta: { from: product.approval, to: rule.to, ...(reason ? { reason } : {}) },
      ip,
    }),
    notify({
      userId: product.seller.userId,
      type: `product.${action}`,
      title: MESSAGES[action].title(product.name),
      body: MESSAGES[action].body(reason),
      link: `/seller/products/${productId}`,
    }),
  ]);
  return getProduct(productId);
}
