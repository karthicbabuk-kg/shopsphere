import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSuggestions } from '../../features/storefront/storeApi';
import { cdn } from '../../utils/cdn';
import { formatINR } from '../../utils/format';

interface Option {
  key: string;
  label: string;
  hint?: string;
  image?: string | null;
  to: string;
  group: string;
}

/** ARIA combobox: type to see suggestions, arrow keys to move, Enter to go, Escape to close. */
export function SearchBox() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 200);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const { data } = useSuggestions(debounced);
  const q = value.trim();
  const options: Option[] = q
    ? [
        { key: 'all', label: `Search for “${q}”`, to: `/search?q=${encodeURIComponent(q)}`, group: '' },
        ...(data?.products.map((p) => ({ key: `p-${p.slug}`, label: p.name, hint: formatINR(p.pricePaise), image: p.image, to: `/p/${p.slug}`, group: 'Products' })) ?? []),
        ...(data?.categories.map((c) => ({ key: `c-${c.slug}`, label: c.name, hint: 'Category', to: `/c/${c.slug}`, group: 'Categories' })) ?? []),
        ...(data?.brands.map((b) => ({ key: `b-${b.slug}`, label: b.name, hint: 'Brand', to: `/search?brand=${b.slug}`, group: 'Brands' })) ?? []),
      ]
    : [];

  const go = (to: string) => {
    setOpen(false);
    setActive(-1);
    navigate(to);
  };

  return (
    <div ref={wrap} className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const opt = options[active];
          if (opt) return go(opt.to);
          if (q) go(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <label htmlFor={`${listId}-input`} className="sr-only">Search products, brands and categories</label>
        <div className="flex h-11 items-center rounded-lg border border-line bg-zone/60 px-3 transition-colors focus-within:border-blue-600 focus-within:bg-white">
          <Search size={18} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            id={`${listId}-input`}
            type="search"
            role="combobox"
            aria-expanded={open && options.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            placeholder="Search for products, brands, SKU…"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(true);
                setActive((a) => (a + 1) % Math.max(options.length, 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
              } else if (e.key === 'Escape') {
                setOpen(false);
                setActive(-1);
              }
            }}
            className="h-full w-full bg-transparent px-2 text-sm outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:appearance-none"
          />
        </div>
      </form>

      {open && options.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Search suggestions" className="absolute top-full right-0 left-0 z-50 mt-1 max-h-[70vh] overflow-auto rounded-lg border border-line bg-white py-1 shadow-e2">
          {options.map((o, i) => (
            <li key={o.key} role="presentation">
              {o.group && options[i - 1]?.group !== o.group && (
                <p className="px-4 pt-2 pb-1 font-mono text-[11px] tracking-wider text-faint uppercase">{o.group}</p>
              )}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(o.to)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${i === active ? 'bg-blue-50' : ''}`}
              >
                {o.image !== undefined ? (
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-zone">
                    {o.image && <img src={cdn(o.image, 72)} alt="" width={36} height={36} className="h-full w-full object-cover" />}
                  </span>
                ) : (
                  <Search size={16} className="shrink-0 text-faint" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 font-mono text-xs text-muted">{o.hint}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
