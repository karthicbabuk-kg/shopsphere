import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PageMeta } from '@shopsphere/shared-types';
import type { SettingsInput } from '@shopsphere/shared-validation';
import { api, unwrap } from '../../services/api';
import { toast } from '../../store/toast';
import type { Order, Shipment } from '../orders/ordersApi';

export interface Kpis {
  salesPaise: number;
  orders: number;
  units: number;
  avgOrderPaise: number;
  deliveryPaise: number;
  discountPaise: number;
  commissionPaise: number;
  netToSellersPaise: number;
  cancelled: number;
  returned: number;
}
export interface SeriesPoint { date: string; salesPaise: number; orders: number }
interface ReportBase {
  days: number;
  series: SeriesPoint[];
  statusBreakdown: { status: string; count: number }[];
  topItems: { name: string; units: number; salesPaise: number }[];
}
export interface SellerReport extends ReportBase {
  kpis: Kpis & { pendingFulfilment: number };
  payouts: { readyToSettlePaise: number; inPendingSettlementPaise: number; paidPaise: number };
}
export interface AdminReport extends ReportBase {
  kpis: Kpis & { newBuyers: number; activeSellers: number };
  topSellers: { sellerId: string; name: string; salesPaise: number; orders: number; commissionPaise: number }[];
  categories: { name: string; salesPaise: number; units: number }[];
  inventory: { unitsAvailable: number; unitsReserved: number; unitsSold: number; lowStockSkus: number; outOfStockSkus: number; valuePaise: number };
}

export const useSellerReport = (days: number) =>
  useQuery({ queryKey: ['seller-report', days], placeholderData: keepPreviousData, queryFn: () => unwrap<SellerReport>(api.get('/seller/reports/summary', { params: { days } })) });

export const useAdminReport = (days: number) =>
  useQuery({ queryKey: ['admin-report', days], placeholderData: keepPreviousData, queryFn: () => unwrap<AdminReport>(api.get('/admin/reports/summary', { params: { days } })) });

export interface Settlement {
  id: string;
  periodStart: string;
  periodEnd: string;
  grossPaise: number;
  commissionPaise: number;
  netPaise: number;
  status: 'PENDING' | 'PAID';
  createdAt: string;
  sellerName?: string;
  shipments?: number;
  _count?: { commissions: number };
}

export const useSellerSettlements = () =>
  useQuery({ queryKey: ['seller-settlements'], queryFn: () => unwrap<{ items: Settlement[] }>(api.get('/seller/reports/settlements')).then((r) => r.items) });

/**
 * Downloads a CSV through the authenticated client (the file endpoints need the bearer token, so a
 * plain link would not work) and hands it to the browser as a file.
 */
export async function downloadCsv(path: string, params?: Record<string, unknown>) {
  try {
    const res = await api.get(path, { params, responseType: 'blob' });
    const name = /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ?? 'export.csv';
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${name}`);
  } catch {
    toast.error('Could not download the file. Please try again.');
  }
}

// ───────── Admin: orders ─────────
export interface AdminOrderRow {
  id: string;
  orderNo: string;
  status: string;
  placedAt: string;
  totalPaise: number;
  buyer: string;
  shipments: number;
  payment: { method: string; status: string } | null;
}
export const useAdminOrders = (p: { status?: string; q?: string; page: number }) =>
  useQuery({
    queryKey: ['admin-orders', p],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await api.get('/admin/orders', { params: { ...p, pageSize: 10 } });
      const body = res.data as { data: { items: AdminOrderRow[]; statusCounts: Record<string, number> }; meta: PageMeta };
      return { ...body.data, meta: body.meta };
    },
  });

export interface AdminOrderDetail extends Omit<Order, 'shipments'> {
  buyer: { name: string; email: string };
  shipments: (Shipment & { sellerId: string; commission: { rateBp: number; amountPaise: number; netSellerPaise: number } | null })[];
}
export const useAdminOrder = (id: string) =>
  useQuery({ queryKey: ['admin-order', id], queryFn: () => unwrap<{ order: AdminOrderDetail }>(api.get(`/admin/orders/${id}`)).then((r) => r.order) });

// ───────── Admin: settlements ─────────
export interface PendingSettlement { sellerId: string; name: string; shipments: number; grossPaise: number; commissionPaise: number; netPaise: number }
export const useAdminSettlements = () =>
  useQuery({ queryKey: ['admin-settlements'], queryFn: () => unwrap<{ pending: PendingSettlement[]; items: Settlement[] }>(api.get('/admin/settlements')) });

export function useSettlementActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-settlements'] });
  const fail = (e: Error) => toast.error(e.message);
  return {
    create: useMutation({
      mutationFn: (sellerId: string) => unwrap(api.post('/admin/settlements', { sellerId })),
      onSuccess: () => { toast.success('Settlement created'); void refresh(); }, onError: fail,
    }),
    pay: useMutation({
      mutationFn: (id: string) => unwrap(api.post(`/admin/settlements/${id}/pay`)),
      onSuccess: () => { toast.success('Marked as paid (demo, no real transfer)'); void refresh(); }, onError: fail,
    }),
  };
}

// ───────── Admin: settings ─────────
export interface SettingsData { values: Required<SettingsInput>; defaults: Required<SettingsInput> }
export const useAdminSettings = () =>
  useQuery({ queryKey: ['admin-settings'], queryFn: () => unwrap<SettingsData>(api.get('/admin/settings')) });

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: SettingsInput) => unwrap<SettingsData>(api.put('/admin/settings', v)),
    onSuccess: (d) => {
      qc.setQueryData(['admin-settings'], d);
      void qc.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Settings saved. New prices and fees apply from now on.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
