import type { SellerAction, SellerListQuery } from '@shopsphere/shared-validation';
import type { SellerStatus } from '@shopsphere/shared-types';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { pageArgs, pageMeta } from '../../utils/pagination.js';
import { notify } from '../notifications/notifications.service.js';

/** Allowed source statuses and resulting status per admin action. */
const TRANSITIONS: Record<SellerAction, { from: SellerStatus[]; to: SellerStatus; needsReason: boolean }> = {
  approve: { from: ['PENDING', 'REJECTED'], to: 'APPROVED', needsReason: false },
  reject: { from: ['PENDING'], to: 'REJECTED', needsReason: true },
  suspend: { from: ['APPROVED'], to: 'SUSPENDED', needsReason: true },
  reactivate: { from: ['SUSPENDED'], to: 'APPROVED', needsReason: false },
};

const MESSAGES: Record<SellerAction, { title: string; body: (r?: string) => string }> = {
  approve: {
    title: 'Your store has been approved',
    body: () => 'You can now publish products and receive orders.',
  },
  reject: {
    title: 'Your seller application was not approved',
    body: (r) => `Reason: ${r}`,
  },
  suspend: { title: 'Your store has been suspended', body: (r) => `Reason: ${r}` },
  reactivate: {
    title: 'Your store has been reactivated',
    body: () => 'Your products are visible to buyers again.',
  },
};

export async function listSellers(q: SellerListQuery) {
  const where: Prisma.SellerWhereInput = {
    deletedAt: null,
    ...(q.status ? { status: q.status } : {}),
    ...(q.q
      ? {
          OR: [
            { businessName: { contains: q.q, mode: 'insensitive' } },
            { store: { name: { contains: q.q, mode: 'insensitive' } } },
            { user: { email: { contains: q.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [rows, total, counts] = await Promise.all([
    prisma.seller.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      ...pageArgs(q),
      include: {
        store: { select: { name: true, slug: true, logoUrl: true } },
        user: { select: { email: true, name: true, phone: true } },
        _count: { select: { products: true } },
      },
    }),
    prisma.seller.count({ where }),
    prisma.seller.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
  ]);
  return {
    items: rows,
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    meta: pageMeta(q, total),
  };
}

export async function getSeller(id: string) {
  const seller = await prisma.seller.findFirst({
    where: { id, deletedAt: null },
    include: {
      store: true,
      documents: { orderBy: { createdAt: 'desc' } },
      user: { select: { id: true, email: true, name: true, phone: true, createdAt: true } },
      _count: { select: { products: true, orders: true } },
    },
  });
  if (!seller) throw AppError.notFound('Seller not found');

  const history = await prisma.auditLog.findMany({
    where: { entity: 'seller', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, action: true, meta: true, createdAt: true, actor: { select: { name: true } } },
  });
  return { ...seller, history };
}

export async function applyAction(
  sellerId: string,
  action: SellerAction,
  actorId: string,
  reason: string | undefined,
  ip?: string | null,
) {
  const rule = TRANSITIONS[action];
  if (rule.needsReason && !reason) throw AppError.badRequest('A reason is required');

  const seller = await prisma.seller.findFirst({
    where: { id: sellerId, deletedAt: null },
    select: { id: true, userId: true, status: true },
  });
  if (!seller) throw AppError.notFound('Seller not found');

  // Atomic compare-and-set so two admins cannot apply conflicting transitions.
  const res = await prisma.seller.updateMany({
    where: { id: sellerId, status: { in: rule.from } },
    data: {
      status: rule.to,
      rejectionReason: rule.needsReason ? reason! : null,
      ...(action === 'approve' ? { approvedAt: new Date(), approvedById: actorId } : {}),
    },
  });
  if (res.count === 0) {
    throw AppError.conflict(`Cannot ${action} a seller whose status is ${seller.status}`, {
      currentStatus: seller.status,
    });
  }

  await Promise.all([
    audit({
      actorId,
      action: `seller.${action}`,
      entity: 'seller',
      entityId: sellerId,
      meta: { from: seller.status, to: rule.to, ...(reason ? { reason } : {}) },
      ip,
    }),
    notify({
      userId: seller.userId,
      type: `seller.${action}`,
      title: MESSAGES[action].title,
      body: MESSAGES[action].body(reason),
      link: '/seller',
    }),
  ]);
  return getSeller(sellerId);
}
