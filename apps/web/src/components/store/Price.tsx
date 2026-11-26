import { formatINR } from '../../utils/format';

export function Price({
  pricePaise,
  mrpPaise,
  discountPct,
  size = 'md',
}: {
  pricePaise: number;
  mrpPaise: number;
  discountPct: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const main = { sm: 'text-base', md: 'text-lg', lg: 'text-3xl' }[size];
  const sub = size === 'lg' ? 'text-base' : 'text-sm';
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={`font-bold tabular-nums ${main}`}>{formatINR(pricePaise)}</span>
      {discountPct > 0 && (
        <>
          <span className={`text-faint line-through tabular-nums ${sub}`}>
            <span className="sr-only">Original price </span>
            {formatINR(mrpPaise)}
          </span>
          <span className={`font-medium text-success ${sub}`}>{discountPct}% off</span>
        </>
      )}
    </div>
  );
}
