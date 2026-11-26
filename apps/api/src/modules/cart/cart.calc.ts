export interface CartLine {
  sellerId: string;
  unitPricePaise: number;
  mrpPaise: number;
  quantity: number;
}

export interface CartSettings {
  deliveryFeePaise: number;
  freeDeliveryThresholdPaise: number;
  taxRateBp: number;
}

export interface CartTotals {
  itemCount: number;
  subtotalPaise: number;
  mrpTotalPaise: number;
  savingsPaise: number;
  deliveryPaise: number;
  /** GST contained in the grand total (prices are tax-inclusive). */
  taxIncludedPaise: number;
  grandTotalPaise: number;
  perSeller: { sellerId: string; subtotalPaise: number; deliveryPaise: number; freeDelivery: boolean; remainingForFreePaise: number }[];
}

/** Integer division rounded half up. All money maths stays in integer paise. */
export const roundDiv = (numerator: number, denominator: number) =>
  Math.floor((numerator * 2 + denominator) / (denominator * 2));

/**
 * Totals are computed on the server only. Delivery is charged per seller shipment and waived when
 * that seller's subtotal reaches the free-delivery threshold.
 */
export function computeCart(lines: CartLine[], s: CartSettings): CartTotals {
  const bySeller = new Map<string, number>();
  let subtotal = 0;
  let mrpTotal = 0;
  let itemCount = 0;
  for (const l of lines) {
    const line = l.unitPricePaise * l.quantity;
    subtotal += line;
    mrpTotal += l.mrpPaise * l.quantity;
    itemCount += l.quantity;
    bySeller.set(l.sellerId, (bySeller.get(l.sellerId) ?? 0) + line);
  }

  const perSeller = [...bySeller.entries()].map(([sellerId, sub]) => {
    const free = sub >= s.freeDeliveryThresholdPaise;
    return {
      sellerId,
      subtotalPaise: sub,
      deliveryPaise: free ? 0 : s.deliveryFeePaise,
      freeDelivery: free,
      remainingForFreePaise: free ? 0 : s.freeDeliveryThresholdPaise - sub,
    };
  });
  const delivery = perSeller.reduce((n, p) => n + p.deliveryPaise, 0);
  const grand = subtotal + delivery;

  return {
    itemCount,
    subtotalPaise: subtotal,
    mrpTotalPaise: mrpTotal,
    savingsPaise: Math.max(0, mrpTotal - subtotal),
    deliveryPaise: delivery,
    taxIncludedPaise: roundDiv(grand * s.taxRateBp, 10_000 + s.taxRateBp),
    grandTotalPaise: grand,
    perSeller,
  };
}
