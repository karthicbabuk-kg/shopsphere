import { prisma } from '../../database/prisma.js';

/** Platform-wide business settings. Values stored in `platform_settings` override these defaults. */
export const SETTING_DEFAULTS = {
  /** Flat delivery fee per seller shipment, in paise. */
  deliveryFeePaise: 4900,
  /** Shipments from one seller above this subtotal ship free, in paise. */
  freeDeliveryThresholdPaise: 49900,
  /** GST rate in basis points (1800 = 18%). Product prices are tax-inclusive. */
  taxRateBp: 1800,
  /** Platform commission on seller order value, in basis points (1000 = 10%). */
  commissionBp: 1000,
  /** Smallest order the checkout accepts, in paise. */
  minOrderPaise: 19900,
  /** Default reorder level suggested for new SKUs. */
  lowStockDefault: 5,
} as const;

export type Settings = { -readonly [K in keyof typeof SETTING_DEFAULTS]: number };

let cache: { at: number; value: Settings } | null = null;
const TTL_MS = 30_000;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await prisma.platformSetting.findMany();
  const value: Settings = { ...SETTING_DEFAULTS };
  for (const r of rows) {
    if (r.key in value && typeof r.value === 'number') value[r.key as keyof Settings] = r.value;
  }
  cache = { at: Date.now(), value };
  return value;
}

export const clearSettingsCache = () => {
  cache = null;
};
