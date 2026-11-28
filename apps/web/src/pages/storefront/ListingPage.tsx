import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Drawer from '@mui/material/Drawer';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import TextField from '@mui/material/TextField';
import { SlidersHorizontal, X } from 'lucide-react';
import { FilterPanel, type FilterState } from '../../components/store/FilterPanel';
import { ProductCard, ProductCardSkeleton } from '../../components/store/ProductCard';
import { EmptyState } from '../../components/EmptyState';
import { useProductList } from '../../features/storefront/storeApi';
import { formatINRWhole } from '../../utils/format';

const SORTS = [
  { value: 'popular', label: 'Popularity' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Customer rating' },
];

const num = (v: string | null) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Search results and category pages. The URL is the single source of truth for filters. */
export function ListingPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [drawer, setDrawer] = useState(false);

  const q = params.get('q') ?? '';
  const store = params.get('store') ?? undefined;
  const category = slug ?? params.get('category') ?? undefined;
  const sort = SORTS.some((s) => s.value === params.get('sort')) ? params.get('sort')! : 'popular';
  const page = Math.max(1, num(params.get('page')) ?? 1);
  const filters: FilterState = useMemo(
    () => ({
      brands: (params.get('brand') ?? '').split(',').filter(Boolean),
      minPrice: num(params.get('minPrice')),
      maxPrice: num(params.get('maxPrice')),
      rating: num(params.get('rating')),
      inStock: params.get('inStock') === 'true',
    }),
    [params],
  );

  const { data, isLoading, isError, isFetching } = useProductList({
    q: q || undefined,
    category,
    store,
    brand: filters.brands.length ? filters.brands.join(',') : undefined,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    rating: filters.rating,
    inStock: filters.inStock || undefined,
    sort,
    page,
  });

  const heading = data?.category?.name ?? (q ? `Results for “${q}”` : store ? 'Store products' : 'All products');
  useEffect(() => {
    document.title = `${heading} · ShopSphere`;
  }, [heading]);
  // New pages start at the top and Back restores the old position (router ScrollRestoration); the only
  // jump we add ourselves is when the visitor turns to another page of results.
  const shownPage = useRef(page);
  useEffect(() => {
    if (shownPage.current !== page) {
      shownPage.current = page;
      window.scrollTo({ top: 0 });
    }
  }, [page]);

  const patch = (changes: Partial<FilterState> & { sort?: string }) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      const set = (k: string, v: string | number | undefined | boolean) => (v === undefined || v === '' || v === false ? n.delete(k) : n.set(k, String(v)));
      if ('brands' in changes) set('brand', changes.brands?.join(','));
      if ('minPrice' in changes) set('minPrice', changes.minPrice);
      if ('maxPrice' in changes) set('maxPrice', changes.maxPrice);
      if ('rating' in changes) set('rating', changes.rating);
      if ('inStock' in changes) set('inStock', changes.inStock);
      if ('sort' in changes) set('sort', changes.sort === 'popular' ? undefined : changes.sort);
      n.delete('page');
      return n;
    });

  const clear = () =>
    setParams((prev) => {
      const n = new URLSearchParams();
      for (const k of ['q', 'store', 'sort']) if (prev.get(k)) n.set(k, prev.get(k)!);
      return n;
    });

  const chips: { label: string; remove: () => void }[] = [
    ...filters.brands.map((b) => ({ label: data?.facets.brands.find((x) => x.slug === b)?.name ?? b, remove: () => patch({ brands: filters.brands.filter((x) => x !== b) }) })),
    ...(filters.minPrice !== undefined || filters.maxPrice !== undefined
      ? [{ label: `${formatINRWhole(filters.minPrice ?? 0)} – ${filters.maxPrice !== undefined ? formatINRWhole(filters.maxPrice) : 'any'}`, remove: () => patch({ minPrice: undefined, maxPrice: undefined }) }]
      : []),
    ...(filters.rating ? [{ label: `${filters.rating}★ & above`, remove: () => patch({ rating: undefined }) }] : []),
    ...(filters.inStock ? [{ label: 'In stock only', remove: () => patch({ inStock: false }) }] : []),
    ...(store ? [{ label: `Store: ${store}`, remove: () => setParams((p) => { const n = new URLSearchParams(p); n.delete('store'); return n; }) }] : []),
  ];

  const panel = (
    <FilterPanel facets={data?.facets} state={filters} onChange={patch} onClear={clear} subcategoryLinks={data?.facets.subcategories} />
  );

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-5">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link to="/" className="hover:text-blue-600">Home</Link></li>
          {data?.category?.parent && (<><li aria-hidden="true">/</li><li><Link to={`/c/${data.category.parent.slug}`} className="hover:text-blue-600">{data.category.parent.name}</Link></li></>)}
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-ink">{data?.category?.name ?? (q ? 'Search' : 'All products')}</li>
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block"><div className="sticky top-[132px] max-h-[calc(100vh-150px)] overflow-auto rounded-lg border border-line bg-white p-5">{panel}</div></aside>

        <section aria-labelledby="results-heading" className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 id="results-heading" className="text-2xl sm:text-3xl">{heading}</h1>
              <p className="mt-0.5 text-sm text-muted" aria-live="polite">
                {data ? `${data.meta.total} ${data.meta.total === 1 ? 'product' : 'products'}` : 'Loading…'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDrawer(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium lg:hidden">
                <SlidersHorizontal size={16} aria-hidden="true" /> Filters{chips.length > 0 && ` (${chips.length})`}
              </button>
              <TextField select size="small" label="Sort by" value={sort} onChange={(e) => patch({ sort: e.target.value })} sx={{ minWidth: 190, bgcolor: 'white' }}>
                {SORTS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
              </TextField>
            </div>
          </div>

          {chips.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.label}>
                  <button type="button" onClick={c.remove} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 hover:bg-blue-100" aria-label={`Remove filter ${c.label}`}>
                    {c.label} <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {isError ? (
            <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-800">Could not load products. Please try again.</p>
          ) : isLoading ? (
            <ul className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <li key={i}><ProductCardSkeleton /></li>)}</ul>
          ) : data && data.items.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="No products found"
                message={q ? `We couldn't find anything for “${q}” with these filters. Check the spelling, try a more general term, or remove some filters.` : 'Try removing some filters.'}
                action={chips.length > 0 ? <button type="button" onClick={clear} className="font-bold text-blue-600">Clear all filters</button> : <Link to="/" className="font-bold text-blue-600">Back to home</Link>}
              />
            </div>
          ) : (
            <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
              <ul className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {data?.items.map((p, i) => <li key={p.id}><ProductCard p={p} priority={i < 4} /></li>)}
              </ul>
              {data && data.meta.totalPages > 1 && (
                <div className="mt-8 flex justify-center">
                  <Pagination count={data.meta.totalPages} page={page} color="primary" onChange={(_, p) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('page', String(p)); return n; })} />
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <Drawer anchor="bottom" open={drawer} onClose={() => setDrawer(false)} slotProps={{ paper: { sx: { maxHeight: '88vh', borderTopLeftRadius: 20, borderTopRightRadius: 20 } } }}>
        <div className="overflow-auto p-5">
          <div className="mb-2 flex justify-end"><button type="button" onClick={() => setDrawer(false)} aria-label="Close filters" className="grid h-9 w-9 place-items-center rounded-full hover:bg-zone"><X size={20} /></button></div>
          {panel}
          <button type="button" onClick={() => setDrawer(false)} className="mt-5 h-12 w-full rounded-xl bg-blue-600 font-bold text-white">Show {data?.meta.total ?? ''} results</button>
        </div>
      </Drawer>
    </div>
  );
}
