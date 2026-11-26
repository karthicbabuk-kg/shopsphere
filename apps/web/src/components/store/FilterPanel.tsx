import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Slider from '@mui/material/Slider';
import { Star } from 'lucide-react';
import type { Facets } from '../../features/storefront/storeApi';
import { formatINRWhole } from '../../utils/format';

export interface FilterState {
  brands: string[];
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock: boolean;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-0 border-b border-line p-0 pb-5 [&:not(:first-child)]:pt-5">
      <legend className="float-left mb-3 w-full font-mono text-xs tracking-wider text-muted uppercase">{title}</legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

const roundDown = (paise: number) => Math.floor(paise / 10_000) * 100; // rupees, to ₹100
const roundUp = (paise: number) => Math.ceil(paise / 10_000) * 100;

export function FilterPanel({
  facets,
  state,
  onChange,
  onClear,
  subcategoryLinks,
}: {
  facets?: Facets;
  state: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onClear: () => void;
  subcategoryLinks?: { slug: string; name: string }[];
}) {
  const lo = facets?.price ? roundDown(facets.price.minPaise) : 0;
  const hi = facets?.price ? Math.max(roundUp(facets.price.maxPaise), lo + 100) : 0;
  const [range, setRange] = useState<[number, number]>([state.minPrice !== undefined ? state.minPrice / 100 : lo, state.maxPrice !== undefined ? state.maxPrice / 100 : hi]);

  // Keep the slider in step with the URL and with the available price range.
  useEffect(() => {
    setRange([state.minPrice !== undefined ? state.minPrice / 100 : lo, state.maxPrice !== undefined ? state.maxPrice / 100 : hi]);
  }, [state.minPrice, state.maxPrice, lo, hi]);

  const hasFilters = state.brands.length > 0 || state.minPrice !== undefined || state.maxPrice !== undefined || !!state.rating || state.inStock;
  const step = hi - lo > 20_000 ? 500 : 100;

  return (
    <div className="space-y-0" aria-label="Filters">
      <div className="flex items-center justify-between pb-4">
        <h2 className="text-lg">Filters</h2>
        {hasFilters && (
          <button type="button" onClick={onClear} className="text-sm font-bold text-blue-600 hover:text-blue-700">Clear all</button>
        )}
      </div>

      {subcategoryLinks && subcategoryLinks.length > 0 && (
        <Group title="Sub-categories">
          <ul className="space-y-1.5 text-sm">
            {subcategoryLinks.map((c) => (
              <li key={c.slug}><Link to={`/c/${c.slug}`} className="text-muted hover:text-blue-600">{c.name}</Link></li>
            ))}
          </ul>
        </Group>
      )}

      {facets && facets.brands.length > 0 && (
        <Group title="Brand">
          <ul className="max-h-56 space-y-1 overflow-auto pr-1">
            {facets.brands.map((b) => {
              const checked = state.brands.includes(b.slug);
              return (
                <li key={b.slug}>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChange({ brands: checked ? state.brands.filter((x) => x !== b.slug) : [...state.brands, b.slug] })}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span className="flex-1">{b.name}</span>
                    <span className="font-mono text-xs text-faint">{b.count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Group>
      )}

      {facets?.price && hi > lo && (
        <Group title="Price">
          <div className="px-2">
            <Slider
              size="small"
              min={lo}
              max={hi}
              step={step}
              value={range}
              onChange={(_, v) => setRange(v as [number, number])}
              onChangeCommitted={(_, v) => {
                const [a, b] = v as [number, number];
                onChange({ minPrice: a <= lo ? undefined : a * 100, maxPrice: b >= hi ? undefined : b * 100 });
              }}
              getAriaLabel={(i) => (i === 0 ? 'Minimum price' : 'Maximum price')}
              getAriaValueText={(v) => formatINRWhole(v * 100)}
              valueLabelDisplay="off"
            />
          </div>
          <p className="flex justify-between font-mono text-xs text-muted">
            <span>{formatINRWhole(range[0] * 100)}</span>
            <span>{formatINRWhole(range[1] * 100)}</span>
          </p>
        </Group>
      )}

      <Group title="Customer rating">
        <ul className="space-y-1">
          {[4, 3, 2].map((r) => (
            <li key={r}>
              <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
                <input type="radio" name="rating" checked={state.rating === r} onChange={() => onChange({ rating: r })} className="h-4 w-4 accent-blue-600" />
                <span className="inline-flex items-center gap-1">{r} <Star size={13} className="fill-amber-500 text-amber-500" aria-hidden="true" /> &amp; above</span>
              </label>
            </li>
          ))}
          <li>
            <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
              <input type="radio" name="rating" checked={!state.rating} onChange={() => onChange({ rating: undefined })} className="h-4 w-4 accent-blue-600" />
              Any rating
            </label>
          </li>
        </ul>
      </Group>

      <Group title="Availability">
        <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" checked={state.inStock} onChange={(e) => onChange({ inStock: e.target.checked })} className="h-4 w-4 accent-blue-600" />
          In stock only
        </label>
      </Group>
    </div>
  );
}
