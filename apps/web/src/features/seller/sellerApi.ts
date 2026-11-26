import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SellerStatus } from '@shopsphere/shared-types';
import type { UpdateStoreInput } from '@shopsphere/shared-validation';
import { api, unwrap } from '../../services/api';
import { toast } from '../../store/toast';

export interface SellerProfile {
  id: string;
  status: SellerStatus;
  businessName: string;
  gstin: string | null;
  rejectionReason: string | null;
  store: {
    name: string;
    slug: string;
    description: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    city: string | null;
    state: string | null;
    logoUrl: string | null;
  } | null;
  documents: { id: string; type: string; url: string; status: string; createdAt: string }[];
}

export const DOCUMENT_TYPES = ['GST certificate', 'PAN card', 'Business registration', 'Bank proof', 'Other'] as const;

function useSellerMutation<V>(fn: (v: V) => Promise<unknown>, success: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(success);
      void qc.invalidateQueries({ queryKey: ['seller', 'me'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

export const useUploadLogo = () =>
  useSellerMutation((file: File) => {
    const form = new FormData();
    form.append('file', file);
    return unwrap(api.post('/sellers/me/logo', form, multipart));
  }, 'Logo updated');

export const useUploadDocument = () =>
  useSellerMutation(({ file, type }: { file: File; type: string }) => {
    const form = new FormData();
    form.append('type', type);
    form.append('file', file);
    return unwrap(api.post('/sellers/me/documents', form, multipart));
  }, 'Document uploaded');

export const useDeleteDocument = () =>
  useSellerMutation((id: string) => unwrap(api.delete(`/sellers/me/documents/${id}`)), 'Document removed');

const KEY = ['seller', 'me'];

export const useSellerProfile = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => unwrap<{ seller: SellerProfile }>(api.get('/sellers/me')).then((r) => r.seller),
  });

export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStoreInput) =>
      unwrap<{ seller: SellerProfile }>(api.patch('/sellers/me', input)),
    onSuccess: () => {
      toast.success('Store profile saved');
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
