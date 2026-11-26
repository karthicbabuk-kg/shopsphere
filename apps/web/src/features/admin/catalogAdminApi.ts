import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApprovalStatus, PageMeta } from '@shopsphere/shared-types';
import type { BrandInput, CategoryInput, ProductAction } from '@shopsphere/shared-validation';
import { api, unwrap } from '../../services/api';
import { toast } from '../../store/toast';

export interface AdminProductRow {
  id: string;
  name: string;
  pricePaise: number;
  status: string;
  approval: ApprovalStatus;
  updatedAt: string;
  image: string | null;
  category: { name: string };
  brand: { name: string } | null;
  seller: { id: string; status: string; store: { name: string } | null };
}

export interface AdminProductDetail {
  id: string;
  name: string;
  description: string;
  mrpPaise: number;
  pricePaise: number;
  status: string;
  approval: ApprovalStatus;
  rejectionReason: string | null;
  category: { name: string };
  brand: { name: string } | null;
  seller: { id: string; status: string; businessName: string; store: { name: string } | null };
  images: { id: string; url: string }[];
  attributes: { id: string; key: string; value: string }[];
  variants: { id: string; sku: string; label: string; pricePaise: number | null; inventory: { available: number; reserved: number; sold: number } | null }[];
  history: {
    id: string;
    action: string;
    meta: { reason?: string } | null;
    createdAt: string;
    actor: { name: string } | null;
  }[];
}

export const useAdminProducts = (p: { approval?: string; q?: string; page: number }) =>
  useQuery({
    queryKey: ['admin', 'products', p],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await api.get('/admin/products', { params: { ...p, pageSize: 10 } });
      const body = res.data as {
        data: { items: AdminProductRow[]; approvalCounts: Partial<Record<ApprovalStatus, number>> };
        meta: PageMeta;
      };
      return { ...body.data, meta: body.meta };
    },
  });

export const useAdminProduct = (id: string) =>
  useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => unwrap<{ product: AdminProductDetail }>(api.get(`/admin/products/${id}`)).then((r) => r.product),
  });

const DONE: Record<ProductAction, string> = {
  approve: 'Product approved and live',
  reject: 'Product rejected',
  suspend: 'Product suspended',
  reinstate: 'Product reinstated',
};

export function useProductAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, reason }: { action: ProductAction; reason?: string }) =>
      unwrap(api.post(`/admin/products/${id}/${action}`, reason ? { reason } : {})),
    onSuccess: (_d, { action }) => {
      toast.success(DONE[action]);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface AdminCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
  _count: { products: number; children: number };
}
export interface AdminBrand {
  id: string;
  name: string;
  active: boolean;
  _count: { products: number };
}

export const useAdminCategories = () =>
  useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => unwrap<{ categories: AdminCategory[] }>(api.get('/admin/categories')).then((r) => r.categories),
  });

export const useAdminBrands = () =>
  useQuery({
    queryKey: ['admin', 'brands'],
    queryFn: () => unwrap<{ brands: AdminBrand[] }>(api.get('/admin/brands')).then((r) => r.brands),
  });

type Kind = 'categories' | 'brands';

/** Create (no id), update (id) or delete for categories and brands. */
export function useTaxonomyMutation(kind: Kind) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', kind] });
    void qc.invalidateQueries({ queryKey: [kind] });
  };
  const label = kind === 'categories' ? 'Category' : 'Brand';
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: string; input: CategoryInput | BrandInput }) =>
        unwrap(id ? api.put(`/admin/${kind}/${id}`, input) : api.post(`/admin/${kind}`, input)),
      onSuccess: (_d, { id }) => {
        toast.success(`${label} ${id ? 'updated' : 'created'}`);
        refresh();
      },
    }),
    remove: useMutation({
      mutationFn: (id: string) => unwrap(api.delete(`/admin/${kind}/${id}`)),
      onSuccess: () => {
        toast.success(`${label} deleted`);
        refresh();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  };
}
