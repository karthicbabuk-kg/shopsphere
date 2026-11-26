import { prisma } from '../../database/prisma.js';

/** Platform KPIs, all computed from live database rows. */
export async function overview() {
  const [buyers, sellerGroups, products, pendingProducts, orders, gross, commission, recentPending] =
    await Promise.all([
      prisma.user.count({ where: { role: 'BUYER', deletedAt: null } }),
      prisma.seller.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.product.count({ where: { deletedAt: null, approval: 'PENDING', status: 'ACTIVE' } }),
      prisma.order.count(),
      // Same definition as the reports: shipments that were not cancelled or returned.
      prisma.sellerOrder.aggregate({
        _sum: { totalPaise: true },
        where: { status: { notIn: ['CANCELLED', 'RETURNED'] } },
      }),
      prisma.commission.aggregate({ _sum: { amountPaise: true } }),
      prisma.seller.findMany({
        where: { status: 'PENDING', deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 5,
        select: {
          id: true,
          businessName: true,
          createdAt: true,
          store: { select: { name: true } },
          user: { select: { email: true } },
        },
      }),
    ]);

  const bySeller = Object.fromEntries(sellerGroups.map((g) => [g.status, g._count]));
  const totalSellers = sellerGroups.reduce((n, g) => n + g._count, 0);
  return {
    buyers,
    sellers: {
      total: totalSellers,
      active: bySeller['APPROVED'] ?? 0,
      pending: bySeller['PENDING'] ?? 0,
      rejected: bySeller['REJECTED'] ?? 0,
      suspended: bySeller['SUSPENDED'] ?? 0,
    },
    products: { total: products, pendingApproval: pendingProducts },
    orders: { total: orders, grossPaise: gross._sum.totalPaise ?? 0 },
    commissionPaise: commission._sum.amountPaise ?? 0,
    pendingSellers: recentPending,
  };
}
