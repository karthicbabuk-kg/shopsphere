import { formatINRWhole } from '../../utils/format';

/** Horizontal ranked bars with the value printed on each row, so no hover is needed to read it. */
export function RankedBars({ rows, format = formatINRWhole, label }: { rows: { name: string; value: number; hint?: string }[]; format?: (n: number) => string; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={label} className="space-y-3">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{r.name}</span>
            <span className="shrink-0 font-medium tabular-nums">{format(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zone" aria-hidden="true"><div className="h-full rounded-full bg-blue-600" style={{ width: `${(r.value / max) * 100}%` }} /></div>
          {r.hint && <p className="mt-0.5 text-xs text-muted">{r.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
