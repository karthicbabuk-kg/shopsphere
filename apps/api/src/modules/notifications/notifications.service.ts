import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { pageArgs, pageMeta } from '../../utils/pagination.js';

interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

export const notify = (n: NotifyInput) =>
  prisma.notification.create({
    data: { userId: n.userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null },
  });

export async function listNotifications(userId: string, page: { page: number; pageSize: number }) {
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      ...pageArgs(page),
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread, meta: pageMeta(page, total) };
}

export async function markRead(userId: string, id: string) {
  // Scoped by userId so one user can never mark another user's notification.
  const res = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (res.count === 0) {
    const exists = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } });
    if (!exists) throw AppError.notFound('Notification not found');
  }
}

export const markAllRead = (userId: string) =>
  prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
