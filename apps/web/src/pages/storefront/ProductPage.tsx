import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { Heart, Minus, Plus, ShoppingCart, Store, Truck, Zap } from 'lucide-react';
import { ImageGallery } from '../../components/store/ImageGallery';
import { Price } from '../../components/store/Price';
import { RatingChip } from '../../components/store/RatingChip';
import { ProductRail } from '../../components/store/ProductRail';
import { ReviewsPanel } from '../../components/store/ReviewsPanel';
import { EmptyState } from '../../components/EmptyState';
import { useBuyerGate } from '../../features/storefront/useBuyerGate';
import { useCartMutations, useProduct, useWishlist, useWishlistToggle } from '../../features/storefront/storeApi';
import { ApiRequestError } from '../../services/api';
import { toast } from '../../store/toast';
import { formatINR } from '../../utils/format';

const PIN_KEY = 'ss_pin';

/** Demo estimate: 2-5 days, derived from the PIN code so the same PIN always gives the same answer. */
function estimate(pin: string) {
  const days = 2 + (pin.split('').reduce((s, d) => s + Number(d), 0) % 4);
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

function DeliveryEstimate() {
  const [pin, setPin] = useState(() => (typeof localStorage !== 'undefined' ? (localStorage.getItem(PIN_KEY) ?? '') : ''));
  const [result, setResult] = useState<string | null>(() => (/^\d{6}$/.test(pin) ? estimate(pin) : null));
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-bold"><Truck size={18} className="text-blue-600" aria-hidden="true" /> Delivery</p>
      <form
        className="mt-3 flex gap-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^\d{6}$/.test(pin)) {
            setResult(null);
            return setError('Enter a valid 6-digit PIN code');
          }
          setError(null);
          setResult(estimate(pin));
          try { localStorage.setItem(PIN_KEY, pin); } catch { /* storage unavailable */ }
        }}
      >
        <label htmlFor="pin" className="sr-only">Delivery PIN code</label>
        <input id="pin" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="Enter PIN code" aria-invalid={!!error} aria-describedby="pin-msg" className="h-10 w-40 rounded-lg border border-line px-3 text-sm outline-none focus:border-blue-600" />
        <Button type="submit" size="small" variant="outlined">Check</Button>
      </form>
      <p id="pin-msg" role="status" className={`mt-2 text-sm ${error ? 'text-danger' : 'text-muted'}`}>
        {error ?? (result ? <>Delivery by <strong className="text-ink">{result}</strong> <span className="text-xs">(demo estimate)</span></> : 'Enter your PIN code to see the delivery date.')}
      </p>
    </div>
  );
}

export function ProductPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const gate = useBuyerGate();
  const { data: p, isLoading, isError, error } = useProduct(slug);
  const { data: wl } = useWishlist();
  const toggle = useWishlistToggle();
  const cart = useCartMutations();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [search] = useSearchParams();
  const [tab, setTab] = useState<'description' | 'specs' | 'reviews'>(search.get('tab') === 'reviews' ? 'reviews' : 'description');

  useEffect(() => {
    if (!p) return;
    document.title = `${p.name} · ShopSphere`;
    setVariantId((cur) => (cur && p.variants.some((v) => v.id === cur) ? cur : (p.variants.find((v) => v.inStock) ?? p.variants[0])?.id ?? null));
    setQty(1);
  }, [p]);

  if (isError) {
    const missing = error instanceof ApiRequestError && error.code === 'NOT_FOUND';
    return (
      <div className="mx-auto max-w-[720px] px-4 py-16">
        <EmptyState title={missing ? 'This product is not available' : 'Could not load this product'} message={missing ? 'It may have been removed or is not currently listed.' : 'Please try again in a moment.'} action={<Link to="/search" className="font-bold text-blue-600">Browse all products</Link>} />
      </div>
    );
  }
  if (isLoading || !p) {
    return (
      // Mirrors the loaded layout (container, breadcrumb row, thumbnail rail, columns) so nothing jumps when data arrives.
      <div className="mx-auto min-h-[1400px] max-w-[1280px] px-4 py-5 pb-28 lg:pb-8" aria-busy="true">
        <div className="mb-4 h-5"><Skeleton width={220} /></div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,580px)_1fr] xl:gap-12">
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <div className="hidden gap-2 sm:flex sm:flex-col">{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" width={72} height={72} />)}</div>
            <Skeleton variant="rounded" sx={{ aspectRatio: '1 / 1', height: 'auto', flex: 1 }} />
          </div>
          <div><Skeleton width="80%" height={40} /><Skeleton width="40%" /><Skeleton width="30%" height={48} /><Skeleton variant="rounded" height={160} /></div>
        </div>
      </div>
    );
  }

  const v = p.variants.find((x) => x.id === variantId) ?? p.variants[0];
  const saved = !!wl?.ids.includes(p.id);
  const maxQty = Math.max(1, v?.maxQty ?? 1);
  const canBuy = !!v?.inStock;

  const addToCart = (after?: () => void) =>
    gate(() => {
      if (!v) return;
      cart.add.mutate({ variantId: v.id, quantity: qty }, { onSuccess: () => { toast.success(after ? 'Added to cart' : `${qty > 1 ? `${qty} items` : 'Item'} added to your cart`); after?.(); } });
    });

  const actions = (
    <div className="flex flex-wrap gap-3">
      <Button variant="contained" size="large" startIcon={<ShoppingCart size={18} />} disabled={!canBuy || cart.add.isPending} onClick={() => addToCart()} sx={{ minWidth: 190, height: 52 }}>
        {cart.add.isPending ? 'Adding…' : 'Add to cart'}
      </Button>
      <Button variant="contained" size="large" color="warning" startIcon={<Zap size={18} />} disabled={!canBuy || cart.add.isPending} onClick={() => addToCart(() => navigate('/cart'))} sx={{ minWidth: 150, height: 52, bgcolor: '#F59E0B', color: '#24262A', '&:hover': { bgcolor: '#FBBF24' } }}>
        Buy now
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-5 pb-28 lg:pb-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link to="/" className="hover:text-blue-600">Home</Link></li>
          {p.category.parent && (<><li aria-hidden="true">/</li><li><Link to={`/c/${p.category.parent.slug}`} className="hover:text-blue-600">{p.category.parent.name}</Link></li></>)}
          <li aria-hidden="true">/</li>
          <li><Link to={`/c/${p.category.slug}`} className="hover:text-blue-600">{p.category.name}</Link></li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,580px)_1fr] xl:gap-12">
        <ImageGallery images={p.images} name={p.name} />

        <div className="min-w-0">
          {p.brand && <Link to={`/search?brand=${p.brand.slug}`} className="font-mono text-xs tracking-wider text-blue-600 uppercase hover:underline">{p.brand.name}</Link>}
          <h1 className="mt-1 text-2xl leading-tight sm:text-3xl">{p.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <RatingChip value={p.ratingAvg} count={p.ratingCount} large />
            {p.ratingCount > 0 && <button type="button" className="text-sm text-blue-600 hover:underline" onClick={() => { setTab('reviews'); document.getElementById('details')?.scrollIntoView({ behavior: 'smooth' }); }}>Read reviews</button>}
            {p.soldCount > 0 && <span className="text-sm text-muted">{p.soldCount.toLocaleString('en-IN')} sold</span>}
          </div>

          <div className="mt-5">
            {v && <Price pricePaise={v.pricePaise} mrpPaise={v.mrpPaise} discountPct={v.discountPct} size="lg" />}
            <p className="mt-1 text-xs text-muted">Inclusive of all taxes</p>
          </div>

          {p.variants.length > 1 && (
            <fieldset className="mt-6 border-0 p-0">
              <legend className="mb-2 text-sm font-bold">Choose an option{v ? <span className="ml-2 font-normal text-muted">{v.label}</span> : null}</legend>
              <div className="flex flex-wrap gap-2">
                {p.variants.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={x.id === v?.id}
                    onClick={() => { setVariantId(x.id); setQty(1); }}
                    className={`min-h-11 rounded-lg border-2 px-4 text-sm transition-colors ${x.id === v?.id ? 'border-blue-600 bg-blue-50 font-bold text-blue-700' : 'border-line bg-white hover:border-blue-600'} ${x.inStock ? '' : 'text-faint line-through'}`}
                  >
                    {x.label}
                    {!x.inStock && <span className="sr-only"> (out of stock)</span>}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <p id="qty-label" className="mb-1 text-sm font-bold">Quantity</p>
              <div className="inline-flex items-center rounded-lg border border-line bg-white" role="group" aria-labelledby="qty-label">
                <button type="button" aria-label="Decrease quantity" disabled={qty <= 1 || !canBuy} onClick={() => setQty((q) => q - 1)} className="grid h-11 w-11 place-items-center disabled:text-faint"><Minus size={16} /></button>
                <output aria-live="polite" className="w-10 text-center font-mono">{qty}</output>
                <button type="button" aria-label="Increase quantity" disabled={qty >= maxQty || !canBuy} onClick={() => setQty((q) => q + 1)} className="grid h-11 w-11 place-items-center disabled:text-faint"><Plus size={16} /></button>
              </div>
            </div>
            <p role="status" className={`text-sm font-medium ${!canBuy ? 'text-danger' : v?.leftCount ? 'text-warning' : 'text-success'}`}>
              {!canBuy ? 'Currently out of stock' : v?.leftCount ? `Only ${v.leftCount} left in stock` : 'In stock'}
            </p>
          </div>

          <div className="mt-6 hidden items-center gap-3 lg:flex">
            {actions}
            <button type="button" aria-pressed={saved} aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'} onClick={() => gate(() => toggle.mutate({ id: p.id, on: !saved }))} className="grid h-[52px] w-[52px] place-items-center rounded-xl border border-line bg-white hover:bg-blue-50">
              <Heart size={22} className={saved ? 'fill-danger text-danger' : 'text-muted'} />
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <DeliveryEstimate />
            {p.seller.store && (
              <div className="rounded-lg border border-line bg-white p-4">
                <p className="flex items-center gap-2 text-sm font-bold"><Store size={18} className="text-blue-600" aria-hidden="true" /> Sold by</p>
                <Link to={`/search?store=${p.seller.store.slug}`} className="mt-2 flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-navy-700 font-bold text-white" aria-hidden="true">{p.seller.store.name.charAt(0)}</span>
                  <span>
                    <span className="block font-bold text-blue-600 hover:underline">{p.seller.store.name}</span>
                    <span className="block text-xs text-muted">{[p.seller.store.city, p.seller.store.state].filter(Boolean).join(', ')} · {p.seller.productCount} products</span>
                  </span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <section id="details" aria-label="Product details" className="mt-12 scroll-mt-40">
        <Tabs value={tab} onChange={(_, t) => setTab(t)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }} aria-label="Product information">
          <Tab value="description" label="Description" />
          <Tab value="specs" label="Specifications" />
          <Tab value="reviews" label={`Reviews (${p.ratingCount})`} />
        </Tabs>
        {tab === 'description' && <p className="max-w-[75ch] whitespace-pre-line leading-7 text-muted">{p.description}</p>}
        {tab === 'specs' && (
          p.attributes.length === 0 ? <p className="text-muted">No specifications listed.</p> : (
            <dl className="max-w-[720px] divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
              {p.attributes.map((a) => (
                <div key={a.key} className="grid grid-cols-[minmax(110px,1fr)_2fr] gap-4 px-5 py-3 text-sm"><dt className="text-muted">{a.key}</dt><dd>{a.value}</dd></div>
              ))}
              {v && <div className="grid grid-cols-[minmax(110px,1fr)_2fr] gap-4 px-5 py-3 text-sm"><dt className="text-muted">SKU</dt><dd className="font-mono">{v.sku}</dd></div>}
            </dl>
          )
        )}
        {tab === 'reviews' && <ReviewsPanel productId={p.id} slug={p.slug} summary={p.reviewSummary} />}
      </section>

      <ProductRail title="You may also like" subtitle="More from this category" items={p.related} />

      {/* Mobile: the purchase actions stay in reach while scrolling. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-white px-4 py-3 shadow-e3 lg:hidden">
        <div className="min-w-0 flex-1">
          {v && <span className="block text-lg font-bold">{formatINR(v.pricePaise)}</span>}
          <span className={`block text-xs ${canBuy ? 'text-success' : 'text-danger'}`}>{canBuy ? 'In stock' : 'Out of stock'}</span>
        </div>
        <Button variant="contained" disabled={!canBuy || cart.add.isPending} onClick={() => addToCart()} sx={{ height: 48, px: 3 }}>Add to cart</Button>
        <Button variant="contained" disabled={!canBuy || cart.add.isPending} onClick={() => addToCart(() => navigate('/cart'))} sx={{ height: 48, px: 3, bgcolor: '#F59E0B', color: '#24262A', '&:hover': { bgcolor: '#FBBF24' } }}>Buy now</Button>
      </div>
    </div>
  );
}
