import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PageMeta } from '@shopsphere/shared-types';
import type { AddressInput, PlaceOrderInput, SellerOrderAction } from '@shopsphere/shared-validation';
import { api, unwrap } from '../../services/api';
import { toast } from '../../store/toast';
import { bustPublicCache } from '../storefront/storeApi';

// ───────── Addresses ─────────
export interface Address {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export const useAddresses = () =>
  useQuery({ queryKey: ['addresses'], queryFn: () => unwrap<{ items: Address[] }>(api.get('/addresses')).then((r) => r.items) });

export function useAddressMutations() {
  const qc = useQueryClient();
  const refresh = (items?: Address[]) => (items ? qc.setQueryData(['addresses'], items) : qc.invalidateQueries({ queryKey: ['addresses'] }));
  return {
    create: useMutation({
      mutationFn: (v: AddressInput) => unwrap<{ address: Address }>(api.post('/addresses', v)),
      onSuccess: () => refresh(),
    }),
    update: useMutation({
      mutationFn: ({ id, ...v }: AddressInput & { id: string }) => unwrap<{ address: Address }>(api.patch(`/addresses/${id}`, v)),
      onSuccess: () => refresh(),
    }),
    remove: useMutation({
      mutationFn: (id: string) => unwrap<{ items: Address[] }>(api.delete(`/addresses/${id}`)),
      onSuccess: (r) => refresh(r.items),
      onError: (e: Error) => toast.error(e.message),
    }),
    makeDefault: useMutation({
      mutationFn: (id: string) => unwrap<{ items: Address[] }>(api.post(`/addresses/${id}/default`)),
      onSuccess: (r) => refresh(r.items),
      onError: (e: Error) => toast.error(e.message),
    }),
  };
}

// ───────── Checkout ─────────
export interface Quote {
  itemCount: number;
  subtotalPaise: number;
  discountPaise: number;
  deliveryPaise: number;
  taxIncludedPaise: number;
  totalPaise: number;
  savingsPaise: number;
  coupon: { code: string; discountPaise: number } | null;
  canCheckout: boolean;
  minOrderPaise: number;
  codAvailable: boolean;
  shipments: {
    sellerId: string;
    store: { name: string; slug: string } | null;
    itemCount: number;
    subtotalPaise: number;
    discountPaise: number;
    deliveryPaise: number;
    totalPaise: number;
  }[];
}

export const fetchQuote = (couponCode?: string) => unwrap<Quote>(api.post('/checkout/quote', { couponCode }));

export const useQuote = (couponCode: string | undefined) =>
  useQuery({
    queryKey: ['checkout', 'quote', couponCode ?? null],
    queryFn: () => fetchQuote(couponCode),
    retry: false,
  });

// ───────── Orders (buyer) ─────────
export type ShipmentStatus =
  | 'PLACED' | 'ACCEPTED' | 'PROCESSING' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURN_REQUESTED' | 'RETURNED';

export interface OrderItem {
  id: string;
  name: string;
  sku: string;
  image: string | null;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  productId: string | null;
  slug: string | null;
}

export interface Shipment {
  id: string;
  status: ShipmentStatus;
  invoiceNo: string;
  store: { name: string; slug: string } | null;
  businessName: string;
  gstin: string | null;
  subtotalPaise: number;
  discountPaise: number;
  deliveryPaise: number;
  taxPaise: number;
  totalPaise: number;
  carrier: string | null;
  trackingNo: string | null;
  cancelReason: string | null;
  returnStatus: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | null;
  returnReason: string | null;
  refundedPaise: number;
  canCancel: boolean;
  canReturn: boolean;
  items: OrderItem[];
  timeline: { status: string; at: string; note: string | null }[];
}

export interface AddressSnapshot {
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  label: string;
}

export interface Order {
  id: string;
  orderNo: string;
  status: string;
  placedAt: string;
  address: AddressSnapshot;
  subtotalPaise: number;
  discountPaise: number;
  deliveryPaise: number;
  taxPaise: number;
  totalPaise: number;
  coupon: { code: string; discountPaise: number } | null;
  payment: { method: 'UPI' | 'CARD' | 'COD'; status: string; reference: string | null; amountPaise: number } | null;
  shipments: Shipment[];
}

export interface OrderSummary {
  id: string;
  orderNo: string;
  status: string;
  placedAt: string;
  totalPaise: number;
  shipmentCount: number;
  itemCount: number;
  preview: { name: string; image: string | null }[];
}

export const useOrders = (filter: string, page: number) =>
  useQuery({
    queryKey: ['orders', filter, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await api.get('/orders', { params: { filter, page, pageSize: 8 } });
      const body = res.data as { data: { items: OrderSummary[] }; meta: PageMeta };
      return { items: body.data.items, meta: body.meta };
    },
  });

export const useOrder = (id: string) =>
  useQuery({ queryKey: ['order', id], queryFn: () => unwrap<{ order: Order }>(api.get(`/orders/${id}`)).then((r) => r.order) });

export function useOrderActions(orderId: string) {
  const qc = useQueryClient();
  const done = (message: string) => (r: { order: Order }) => {
    qc.setQueryData(['order', orderId], r.order);
    void qc.invalidateQueries({ queryKey: ['orders'] });
    toast.success(message);
  };
  const fail = (e: Error) => toast.error(e.message);
  return {
    cancelOrder: useMutation({
      mutationFn: (reason: string) => unwrap<{ order: Order }>(api.post(`/orders/${orderId}/cancel`, { reason })),
      onSuccess: done('Order cancelled'), onError: fail,
    }),
    cancelShipment: useMutation({
      mutationFn: (v: { sid: string; reason: string }) => unwrap<{ order: Order }>(api.post(`/orders/${orderId}/shipments/${v.sid}/cancel`, { reason: v.reason })),
      onSuccess: done('Shipment cancelled'), onError: fail,
    }),
    requestReturn: useMutation({
      mutationFn: (v: { sid: string; reason: string }) => unwrap<{ order: Order }>(api.post(`/orders/${orderId}/shipments/${v.sid}/return`, { reason: v.reason })),
      onSuccess: done('Return requested'), onError: fail,
    }),
  };
}

/** Places the order. `key` makes a retry after a network failure safe: it can never create a second order. */
export const placeOrder = (input: PlaceOrderInput, key: string) =>
  unwrap<{ order: Order; replayed: boolean }>(api.post('/orders', input, { headers: { 'Idempotency-Key': key } }));

// ───────── Seller orders ─────────
export interface SellerOrderRow {
  id: string;
  orderNo: string;
  status: ShipmentStatus;
  placedAt: string;
  totalPaise: number;
  customer: string;
  city: string;
  payment: { method: string; status: string } | null;
  itemCount: number;
  preview: { name: string; image: string | null }[];
}

export type SellerCounts = Record<'NEW' | 'TO_SHIP' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNS', number>;

export const useSellerOrders = (filter: string, q: string, page: number) =>
  useQuery({
    queryKey: ['seller-orders', filter, q, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await api.get('/seller/orders', { params: { filter, q: q || undefined, page, pageSize: 10 } });
      const body = res.data as { data: { items: SellerOrderRow[]; counts: SellerCounts }; meta: PageMeta };
      return { items: body.data.items, counts: body.data.counts, meta: body.meta };
    },
  });

export interface SellerOrderDetail extends Shipment {
  orderNo: string;
  placedAt: string;
  address: AddressSnapshot;
  payment: { method: 'UPI' | 'CARD' | 'COD'; status: string } | null;
  commission: { rateBp: number; amountPaise: number; netSellerPaise: number } | null;
  actions: string[];
}

export const useSellerOrder = (id: string) =>
  useQuery({ queryKey: ['seller-order', id], queryFn: () => unwrap<{ order: SellerOrderDetail }>(api.get(`/seller/orders/${id}`)).then((r) => r.order) });

export function useSellerOrderAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: SellerOrderAction) => unwrap<{ order: SellerOrderDetail }>(api.post(`/seller/orders/${id}/actions`, a)),
    onSuccess: (r) => {
      qc.setQueryData(['seller-order', id], r.order);
      void qc.invalidateQueries({ queryKey: ['seller-orders'] });
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ───────── Reviews ─────────
export interface MyReview {
  eligible: boolean;
  review: { id: string; rating: number; title: string | null; body: string | null } | null;
}
export const useMyReview = (productId: string, enabled: boolean) =>
  useQuery({ queryKey: ['my-review', productId], enabled, queryFn: () => unwrap<MyReview>(api.get(`/reviews/mine/${productId}`)) });

export function useSaveReview(productId: string, slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { rating: number; title?: string; body?: string }) => unwrap<{ review: MyReview['review'] }>(api.put(`/reviews/${productId}`, v)),
    onSuccess: () => {
      bustPublicCache();
      void qc.invalidateQueries({ queryKey: ['my-review', productId] });
      void qc.invalidateQueries({ queryKey: ['storefront', 'reviews', slug] });
      void qc.invalidateQueries({ queryKey: ['storefront', 'product', slug] });
      toast.success('Thanks for your review');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
