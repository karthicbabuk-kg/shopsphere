import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-5 ${accent ? 'border-saffron-500/50 bg-amber-50' : 'border-line bg-white'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-xs tracking-wider text-muted uppercase">{label}</p>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <p className={`mt-2 font-mono font-medium tabular-nums ${typeof value === 'string' && value.length > 8 ? 'text-2xl' : 'text-3xl'}`}>{value}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}
