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
  documents: { id: string }[];
}

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
