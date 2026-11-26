type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<Tone, string> = {
  success: 'bg-green-50 text-green-800',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-800',
  info: 'bg-blue-50 text-blue-700',
  neutral: 'bg-zone text-ink',
};
const DOTS: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-blue-600',
  neutral: 'bg-faint',
};

const STATUS_TONE: Record<string, Tone> = {
  APPROVED: 'success',
  ACTIVE: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
  DRAFT: 'neutral',
};

/** Colour is never the only signal: every badge carries a text label. */
export function StatusBadge({ status, tone }: { status: string; tone?: Tone }) {
  const t = tone ?? STATUS_TONE[status] ?? 'neutral';
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[t]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[t]}`} aria-hidden="true" />
      {status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')}
    </span>
  );
}
