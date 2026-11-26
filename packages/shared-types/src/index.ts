export const ROLES = ['BUYER', 'SELLER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const SELLER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> =
  | { success: true; data: T; meta?: PageMeta }
  | { success: false; error: ApiError };
