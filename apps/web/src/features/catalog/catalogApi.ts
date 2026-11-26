import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApprovalStatus, PageMeta } from '@shopsphere/shared-types';
import type { ImageRef, ProductInput } from '@shopsphere/shared-validation';
import { api, unwrap } from '../../services/api';
import { toast } from '../../store/toast';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  children: { id: string; name: string; slug: string }[];
}
export interface Brand {
  id: string;
  name: string;
}

export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    staleTime: 5 * 60_000,
    queryFn: () => unwrap<{ categories: CategoryNode[] }>(api.get('/categories')).then((r) => r.categories),
  });

export const useBrands = () =>
  useQuery({
    queryKey: ['brands'],
    staleTime: 5 * 60_000,
    queryFn: () => unwrap<{ brands: Brand[] }>(api.get('/brands')).then((r) => r.brands),
  });

export interface ProductRow {
  id: string;
  name: string;
  pricePaise: number;
  mrpPaise: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  approval: ApprovalStatus;
  rejectionReason: string | null;
  updatedAt: string;
  category: { name: string };
  image: string | null;
  skuCount: number;
  skus: string[];
  stock: number;
  lowStock: boolean;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  brandId: string | null;
  mrpPaise: number;
  pricePaise: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  approval: ApprovalStatus;
  rejectionReason: string | null;
  images: (ImageRef & { id: string; position: number })[];
  attributes: { id: string; key: string; value: string }[];
  variants: {
    id: string;
    sku: string;
    label: string;
    optionValues: Record<string, string>;
    pricePaise: number | null;
    mrpPaise: number | null;
    inventory: { available: number; reserved: number; sold: number; reorderLevel: number } | null;
  }[];
}

export interface SellerProductParams {
  q?: string;
  status?: string;
  approval?: string;
  page: number;
}

export const useSellerProducts = (p: SellerProductParams) =>
  useQuery({
    queryKey: ['seller', 'products', p],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await api.get('/seller/products', { params: { ...p, pageSize: 10 } });
      const body = res.data as { data: { items: ProductRow[] }; meta: PageMeta };
      return { items: body.data.items, meta: body.meta };
    },
  });

export const useSellerProduct = (id: string | undefined) =>
  useQuery({
    queryKey: ['seller', 'product', id],
    enabled: !!id,
    queryFn: () =>
      unwrap<{ product: ProductDetail }>(api.get(`/seller/products/${id}`)).then((r) => r.product),
  });

export function useSaveProduct(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductInput) =>
      unwrap<{ product: ProductDetail }>(
        id ? api.put(`/seller/products/${id}`, input) : api.post('/seller/products', input),
      ).then((r) => r.product),
    onSuccess: (product, input) => {
      toast.success(input.status === 'ACTIVE' ? 'Submitted for review' : 'Draft saved');
      void qc.invalidateQueries({ queryKey: ['seller', 'products'] });
      qc.setQueryData(['seller', 'product', product.id], product);
    },
  });
}

export function useArchiveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.delete(`/seller/products/${id}`)),
    onSuccess: () => {
      toast.success('Product archived');
      void qc.invalidateQueries({ queryKey: ['seller', 'products'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export async function uploadProductImages(files: File[]): Promise<ImageRef[]> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const data = await unwrap<{ images: ImageRef[] }>(
    api.post('/uploads/product-images', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
  );
  return data.images.map(({ url, publicId }) => ({ url, publicId }));
}

/** Cloudinary delivery URL with on-the-fly resizing; falls back to the original for other hosts. */
export function thumb(url: string | null | undefined, width = 200): string | undefined {
  if (!url) return undefined;
  return url.includes('res.cloudinary.com') ? url.replace('/upload/', `/upload/c_fill,w_${width},h_${width},q_auto,f_auto/`) : url;
}
