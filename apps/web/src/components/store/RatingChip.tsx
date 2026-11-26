import { Star } from 'lucide-react';

/** Green for 4+, amber for 3-4, red below that; always shows the number so colour is not the only cue. */
export function RatingChip({ value, count, large = false }: { value: number; count?: number; large?: boolean }) {
  if (!count) return <span className="text-xs text-faint">No reviews yet</span>;
  const tone = value >= 4 ? 'bg-green-600' : value >= 3 ? 'bg-amber-600' : 'bg-red-600';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-0.5 rounded-md ${tone} font-medium text-white ${large ? 'px-2 py-1 text-sm' : 'px-1.5 py-0.5 text-xs'}`}>
        {value.toFixed(1)}
        <Star size={large ? 14 : 11} fill="currentColor" aria-hidden="true" />
      </span>
      <span className={`text-muted ${large ? 'text-sm' : 'text-xs'}`}>
        <span className="sr-only">rating from </span>({count})
      </span>
    </span>
  );
}
