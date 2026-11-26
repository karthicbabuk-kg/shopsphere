import { Check, Circle, X } from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../utils/format';
import type { Shipment } from './ordersApi';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE: Record<string, Tone> = {
  PLACED: 'info', CONFIRMED: 'info', ACCEPTED: 'info', PROCESSING: 'warning', PACKED: 'warning',
  PARTIALLY_SHIPPED: 'warning', SHIPPED: 'info', DELIVERED: 'success',
  CANCELLED: 'danger', RETURN_REQUESTED: 'warning', RETURNED: 'neutral',
  PAID: 'success', PENDING: 'warning', FAILED: 'danger', REFUNDED: 'neutral', PARTIALLY_REFUNDED: 'neutral',
};

export const OrderStatusBadge = ({ status }: { status: string }) => <StatusBadge status={status} tone={TONE[status] ?? 'neutral'} />;

export const PAYMENT_LABEL = { UPI: 'UPI (demo)', CARD: 'Card (demo)', COD: 'Cash on delivery' } as const;

const STEPS = ['PLACED', 'ACCEPTED', 'PACKED', 'SHIPPED', 'DELIVERED'] as const;
const STEP_LABEL: Record<string, string> = { PLACED: 'Placed', ACCEPTED: 'Accepted', PACKED: 'Packed', SHIPPED: 'Shipped', DELIVERED: 'Delivered' };

/** Position of a shipment on the happy path (PROCESSING counts as accepted, returns as delivered). */
const rank = (s: string) => {
  if (s === 'PLACED') return 0;
  if (s === 'ACCEPTED' || s === 'PROCESSING') return 1;
  if (s === 'PACKED') return 2;
  if (s === 'SHIPPED') return 3;
  return 4;
};

/** Horizontal progress for a live shipment; cancelled shipments show a single state instead. */
export function ProgressSteps({ status }: { status: Shipment['status'] }) {
  if (status === 'CANCELLED') {
    return <p className="flex items-center gap-2 text-sm font-medium text-danger"><X size={16} aria-hidden="true" /> Cancelled</p>;
  }
  const at = rank(status);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Shipment progress">
      {STEPS.map((s, i) => (
        <li key={s} className="min-w-0 text-center" aria-current={i === at ? 'step' : undefined}>
          <span className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-white ${i <= at ? 'bg-blue-600' : 'bg-line'}`}>
            {i <= at ? <Check size={14} aria-hidden="true" /> : <Circle size={8} aria-hidden="true" />}
          </span>
          <span className={`mt-1 block truncate text-[11px] sm:text-xs ${i <= at ? 'font-medium text-ink' : 'text-faint'}`}>{STEP_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Full audit trail with timestamps; read from the append-only status history. */
export function Timeline({ items }: { items: Shipment['timeline'] }) {
  return (
    <ol className="space-y-3 border-l border-line pl-4">
      {[...items].reverse().map((t, i) => (
        <li key={`${t.status}-${t.at}-${i}`} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />
          <p className="text-sm font-medium">{t.status.charAt(0) + t.status.slice(1).toLowerCase().replace(/_/g, ' ')}</p>
          {t.note && <p className="text-sm text-muted">{t.note}</p>}
          <p className="text-xs text-faint">{formatDateTime(t.at)}</p>
        </li>
      ))}
    </ol>
  );
}

export function AddressBlock({ a }: { a: { name: string; phone: string; line1: string; line2?: string | null; city: string; state: string; pincode: string } }) {
  return (
    <address className="not-italic text-sm leading-relaxed">
      <strong>{a.name}</strong> · {a.phone}<br />
      {a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />
      {a.city}, {a.state} {a.pincode}
    </address>
  );
}
