import { roundDiv } from '../cart/cart.calc.js';

export type SellerOrderStatus =
  | 'PLACED'
  | 'ACCEPTED'
  | 'PROCESSING'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED';

export type OrderStatus =
  | 'PLACED'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PARTIALLY_SHIPPED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

/** Statuses from which a seller order can still be cancelled (nothing has left the warehouse). */
export const CANCELLABLE: readonly SellerOrderStatus[] = ['PLACED', 'ACCEPTED', 'PROCESSING', 'PACKED'];

/** Allowed forward moves. Anything not listed here is rejected. */
export const TRANSITIONS: Record<SellerOrderStatus, readonly SellerOrderStatus[]> = {
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['RETURN_REQUESTED'],
  // A rejected return goes back to DELIVERED; an accepted one ends as RETURNED.
  RETURN_REQUESTED: ['RETURNED', 'DELIVERED'],
  CANCELLED: [],
  RETURNED: [],
};

export const canTransition = (from: SellerOrderStatus, to: SellerOrderStatus) => TRANSITIONS[from].includes(to);

/** Buyers have this long after delivery to request a return. */
export const RETURN_WINDOW_DAYS = 7;

export const returnWindowOpen = (deliveredAt: Date, now = new Date()) =>
  now.getTime() - deliveredAt.getTime() <= RETURN_WINDOW_DAYS * 24 * 3600 * 1000;

/**
 * The buyer-facing order status is never stored independently of its shipments: it is derived from
 * the seller orders so the two can never disagree.
 */
export function deriveOrderStatus(children: SellerOrderStatus[]): OrderStatus {
  const active = children.filter((s) => s !== 'CANCELLED');
  if (active.length === 0) return 'CANCELLED';
  if (active.every((s) => s === 'RETURNED')) return 'RETURNED';

  const delivered = (s: SellerOrderStatus) => s === 'DELIVERED' || s === 'RETURN_REQUESTED' || s === 'RETURNED';
  const shipped = (s: SellerOrderStatus) => s === 'SHIPPED' || delivered(s);

  if (active.every(delivered)) return 'DELIVERED';
  if (active.every(shipped)) return 'SHIPPED';
  if (active.some(shipped)) return 'PARTIALLY_SHIPPED';
  if (active.some((s) => s === 'PROCESSING' || s === 'PACKED')) return 'PROCESSING';
  if (active.some((s) => s === 'ACCEPTED')) return 'CONFIRMED';
  return 'PLACED';
}

export interface CouponRule {
  type: 'PERCENT' | 'FLAT';
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
}

/** Discount in paise for a subtotal (0 when the minimum order is not met). Never exceeds the subtotal. */
export function couponDiscount(c: CouponRule, subtotalPaise: number): number {
  if (subtotalPaise < c.minOrderPaise) return 0;
  let d = c.type === 'PERCENT' ? roundDiv(subtotalPaise * c.value, 100) : c.value;
  if (c.maxDiscountPaise !== null) d = Math.min(d, c.maxDiscountPaise);
  return Math.max(0, Math.min(d, subtotalPaise));
}

/**
 * Splits an amount across weights so the parts add up to exactly the amount (largest remainder).
 * Used to spread one coupon discount over the sellers' shipments without losing a paisa.
 */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || amount === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / total);
  const parts = raw.map(Math.floor);
  let left = amount - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i]! += 1;
    left -= 1;
  }
  return parts;
}

export interface ShipmentInput {
  sellerId: string;
  subtotalPaise: number;
  deliveryPaise: number;
}

export interface ShipmentTotals extends ShipmentInput {
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  commissionPaise: number;
  netSellerPaise: number;
}

/**
 * Per-seller totals. Prices are GST-inclusive, so tax is the portion contained in what the buyer pays
 * for that shipment. Commission is charged on the goods value after discount (not on delivery).
 */
export function shipmentTotals(
  shipments: ShipmentInput[],
  discountPaise: number,
  s: { taxRateBp: number; commissionBp: number },
): ShipmentTotals[] {
  const shares = allocate(discountPaise, shipments.map((x) => x.subtotalPaise));
  return shipments.map((x, i) => {
    const discount = shares[i]!;
    const goods = x.subtotalPaise - discount;
    const total = goods + x.deliveryPaise;
    const commission = roundDiv(goods * s.commissionBp, 10_000);
    return {
      ...x,
      discountPaise: discount,
      taxPaise: roundDiv(total * s.taxRateBp, 10_000 + s.taxRateBp),
      totalPaise: total,
      commissionPaise: commission,
      netSellerPaise: goods - commission,
    };
  });
}
