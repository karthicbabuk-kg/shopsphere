import type { PageMeta } from '@shopsphere/shared-types';

export const pageArgs = ({ page, pageSize }: { page: number; pageSize: number }) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});

export const pageMeta = (
  { page, pageSize }: { page: number; pageSize: number },
  total: number,
): PageMeta => ({ page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
