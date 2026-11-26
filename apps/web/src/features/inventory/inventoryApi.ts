import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PageMeta } from '@shopsphere/shared-types';
import type {
  InventorySettingsInput,
  StockAdjustInput,
  StockCountInput,
  StockInInput,
  StockMovementKind,
  StockOutInput,
  StockStatus,
  WarehouseInput,
} from '@shopsphere/shared-validation';
import { api, unwrap } from '../../services/api';
import { toast } from '../../store/toast';

export interface InventoryRow {
  id: string;
  variantId: string;
  sku: string;
  label: string;
  productId: string;
  productName: string;
  productStatus: string;
  image: string | null;
  unitPricePaise: number;
  available: number;
  reserved: number;
  sold: number;
  reorderLevel: number;
  status: StockStatus;
  warehouse: { id: string; name: string; location: string | null };
  openCount: { id: string; expectedQty: number; countedQty: number; difference: number } | null;
}

interface AlertRow {
  inventoryId: string;
  sku: string;
  productName: string;
  available: number;
  reorderLevel: number;
}

export interface InventorySummary {
  skuCount: number;
  unitsAvailable: number;
  unitsReserved: number;
  unitsSold: number;
  lowStockCount: number;
  outOfStockCount: number;
  openDiscrepancies: number;
  valuationPaise: number;
  alerts: {
    outOfStock: AlertRow[];
    reorderRequired: AlertRow[];
    discrepancies: { adjustmentId: string; inventoryId: string; sku: string; productName: string; expectedQty: number; countedQty: number; difference: number }[];
  };
}

export interface Movement {
  id: string;
  inventoryId: string;
  type: StockMovementKind;
  sku: string;
  productName: string;
  previousQty: number;
  changeQty: number;
  newQty: number;
  reason: string | null;
  referenceNo: string | null;
  by: string;
  createdAt: string;
}

export interface Adjustment {
  id: string;
  inventoryId: string;
  sku: string;
  productName: string;
  expectedQty: number;
  countedQty: number;
  difference: number;
  currentAvailable: number;
  reason: string | null;
  status: 'OPEN' | 'APPLIED' | 'DISMISSED';
  createdAt: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  isDefault: boolean;
  skuCount: number;
}

const paged = async <T>(url: string, params: object) => {
  const res = await api.get(url, { params });
  const body = res.data as { data: { items: T[] }; meta: PageMeta };
  return { items: body.data.items, meta: body.meta };
};

export const useInventory = (p: { q?: string; status?: StockStatus; page: number }) =>
  useQuery({
    queryKey: ['seller', 'inventory', p],
    placeholderData: keepPreviousData,
    queryFn: () => paged<InventoryRow>('/seller/inventory', { ...p, pageSize: 10 }),
  });

export const useInventorySummary = (enabled = true) =>
  useQuery({
    queryKey: ['seller', 'inventory-summary'],
    enabled,
    queryFn: () => unwrap<InventorySummary>(api.get('/seller/inventory/summary')),
  });

export const useMovements = (p: { type?: string; inventoryId?: string; page: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['seller', 'ledger', p],
    placeholderData: keepPreviousData,
    queryFn: () => paged<Movement>('/seller/stock-movements', { pageSize: 15, ...p }),
  });

export const useAdjustments = (status: 'OPEN' | undefined, page: number) =>
  useQuery({
    queryKey: ['seller', 'adjustments', status, page],
    placeholderData: keepPreviousData,
    queryFn: () => paged<Adjustment>('/seller/stock-adjustments', { status, page, pageSize: 10 }),
  });

export const useWarehouses = () =>
  useQuery({
    queryKey: ['seller', 'warehouses'],
    queryFn: () => unwrap<{ warehouses: Warehouse[] }>(api.get('/seller/warehouses')).then((r) => r.warehouses),
  });

/** Any stock change affects every inventory view, the ledger, alerts and notifications. */
function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['inventory', 'inventory-summary', 'ledger', 'adjustments', 'warehouses']) {
      void qc.invalidateQueries({ queryKey: ['seller', key] });
    }
    void qc.invalidateQueries({ queryKey: ['seller', 'products'] });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

interface QtyResult {
  previousQty: number;
  newQty: number;
  referenceNo: string;
}

export type StockOperation =
  | { kind: 'in'; id: string; input: StockInInput }
  | { kind: 'out'; id: string; input: StockOutInput }
  | { kind: 'adjust'; id: string; input: StockAdjustInput };

export function useStockOperation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (op: StockOperation) => {
      const path = { in: 'inward', out: 'outward', adjust: 'adjust' }[op.kind];
      return unwrap<QtyResult>(api.post(`/seller/inventory/${op.id}/${path}`, op.input));
    },
    onSuccess: (r) => {
      toast.success(`Stock updated: ${r.previousQty} → ${r.newQty} (${r.referenceNo})`);
      refresh();
    },
  });
}

export function useRecordCount() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: StockCountInput }) =>
      unwrap<{ adjustment: Adjustment }>(api.post(`/seller/inventory/${id}/count`, input)).then((r) => r.adjustment),
    onSuccess: (a) => {
      toast.success(a.difference === 0 ? 'Count matches the system. No action needed.' : `Discrepancy of ${a.difference > 0 ? '+' : ''}${a.difference} recorded for review`);
      refresh();
    },
  });
}

export function useResolveAdjustment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'apply' | 'dismiss' }) =>
      unwrap(api.post(`/seller/stock-adjustments/${id}/${action}`)),
    onSuccess: (_d, { action }) => {
      toast.success(action === 'apply' ? 'Correction applied to stock' : 'Count dismissed');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateInventorySettings() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: InventorySettingsInput }) =>
      unwrap(api.patch(`/seller/inventory/${id}/settings`, input)),
    onSuccess: () => {
      toast.success('Stock settings saved');
      refresh();
    },
  });
}

export function useCreateWarehouse() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: WarehouseInput) =>
      unwrap<{ warehouse: Warehouse }>(api.post('/seller/warehouses', input)).then((r) => r.warehouse),
    onSuccess: () => {
      toast.success('Warehouse added');
      refresh();
    },
  });
}
