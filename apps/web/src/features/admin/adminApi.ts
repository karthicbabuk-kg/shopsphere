import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PageMeta, SellerStatus } from '@shopsphere/shared-types';
import type { SellerAction } from '@shopsphere/shared-validation';
import { api, unwrap } from '../../services/api';
import { toast } from '../../store/toast';

export interface Overview {
  buyers: number;
  sellers: { total: number; active: number; pending: number; rejected: number; suspended: number };
  products: { total: number; pendingApproval: number };
  orders: { total: number; grossPaise: number };
  commissionPaise: number;
  pendingSellers: {
    id: string;
    businessName: string;
    createdAt: string;
    store: { name: string } | null;
    user: { email: string };
  }[];
}

export interface SellerRow {
  id: string;
  status: SellerStatus;
  businessName: string;
  createdAt: string;
  store: { name: string; slug: string; logoUrl: string | null } | null;
  user: { email: string; name: string; phone: string | null };
  _count: { products: number };
}

export interface SellerDetail extends Omit<SellerRow, 'user'> {
  gstin: string | null;
  pan: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  user: { id: string; email: string; name: string; phone: string | null; createdAt: string };
  store: {
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    city: string | null;
    state: string | null;
  } | null;
  documents: { id: string; type: string; url: string; status: string; createdAt: string }[];
  history: {
    id: string;
    action: string;
    meta: { from?: string; to?: string; reason?: string } | null;
    createdAt: string;
    actor: { name: string } | null;
  }[];
  _count: { products: number; orders: number };
}

export const useOverview = () =>
  useQuery({ queryKey: ['admin', 'overview'], queryFn: () => unwrap<Overview>(api.get('/admin/overview')) });

export interface SellerListParams {
  status?: SellerStatus;
  q?: string;
  page: number;
}

export const useSellerList = (p: SellerListParams) =>
  useQuery({
    queryKey: ['admin', 'sellers', p],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await api.get('/admin/sellers', { params: { ...p, pageSize: 10 } });
      const body = res.data as {
        data: { items: SellerRow[]; statusCounts: Partial<Record<SellerStatus, number>> };
        meta: PageMeta;
      };
      return { ...body.data, meta: body.meta };
    },
  });

export const useSellerDetail = (id: string) =>
  useQuery({
    queryKey: ['admin', 'seller', id],
    queryFn: () => unwrap<{ seller: SellerDetail }>(api.get(`/admin/sellers/${id}`)).then((r) => r.seller),
  });

const ACTION_DONE: Record<SellerAction, string> = {
  approve: 'Seller approved',
  reject: 'Application rejected',
  suspend: 'Seller suspended',
  reactivate: 'Seller reactivated',
};

export function useSellerAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, reason }: { action: SellerAction; reason?: string }) =>
      unwrap<{ seller: SellerDetail }>(api.post(`/admin/sellers/${id}/${action}`, reason ? { reason } : {})),
    onSuccess: (_d, { action }) => {
      toast.success(ACTION_DONE[action]);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
