import { Link, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { ImageOff, Minus, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { useCart, useCartMutations, type CartLine } from '../../features/storefront/storeApi';
import { cdn } from '../../utils/cdn';
import { formatINR } from '../../utils/format';

const ISSUE_TEXT: Record<NonNullable<CartLine['issue']>, string> = {
  UNAVAILABLE: 'This item is no longer available. Remove it to continue.',
  OUT_OF_STOCK: 'Out of stock right now. Remove it or come back later.',
  INSUFFICIENT: 'Not enough stock for this quantity. Reduce it to continue.',
};

function Line({ l }: { l: CartLine }) {
  const { update, remove } = useCartMutations();
  const busy = update.isPending || remove.isPending;
  const dec = () => update.mutate({ id: l.id, quantity: l.quantity - 1 });
  const inc = () => update.mutate({ id: l.id, quantity: l.quantity + 1 });
  const fix = () => update.mutate({ id: l.id, quantity: Math.max(1, l.available) });

  return (
    <li className={`flex gap-4 p-4 sm:p-5 ${l.issue ? 'bg-red-50/40' : ''}`}>
      <Link to={`/p/${l.slug}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-zone sm:h-28 sm:w-28" aria-hidden="true" tabIndex={-1}>
        {l.image ? <img src={cdn(l.image, 224)} alt="" width={112} height={112} loading="lazy" className={`h-full w-full object-cover ${l.issue ? 'opacity-60 grayscale' : ''}`} /> : <span className="grid h-full place-items-center"><ImageOff className="text-faint" /></span>}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <Link to={`/p/${l.slug}`} className="line-clamp-2 font-medium hover:text-blue-600">{l.name}</Link>
            {l.label !== 'Default' && <p className="text-sm text-muted">{l.label}</p>}
            <p className="font-mono text-xs text-faint">{l.sku}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums">{formatINR(l.unitPricePaise * l.quantity)}</p>
            {l.mrpPaise > l.unitPricePaise && <p className="text-xs text-faint line-through">{formatINR(l.mrpPaise * l.quantity)}</p>}
          </div>
        </div>

        {l.issue && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-danger">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{ISSUE_TEXT[l.issue]}{l.issue === 'INSUFFICIENT' && l.available > 0 && <button type="button" onClick={fix} className="ml-2 font-bold underline">Set to {l.available}</button>}</span>
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-4">
          {l.issue !== 'UNAVAILABLE' && l.issue !== 'OUT_OF_STOCK' && (
            <div className="inline-flex items-center rounded-lg border border-line bg-white" role="group" aria-label={`Quantity for ${l.name}`}>
              <button type="button" aria-label="Decrease quantity" disabled={busy || l.quantity <= 1} onClick={dec} className="grid h-10 w-10 place-items-center disabled:text-faint"><Minus size={15} /></button>
              <output aria-live="polite" className="w-9 text-center font-mono text-sm">{l.quantity}</output>
              <button type="button" aria-label="Increase quantity" disabled={busy || l.quantity >= l.maxQty} onClick={inc} className="grid h-10 w-10 place-items-center disabled:text-faint"><Plus size={15} /></button>
            </div>
          )}
          <button type="button" disabled={busy} onClick={() => remove.mutate(l.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-danger">
            <Trash2 size={16} aria-hidden="true" /> Remove<span className="sr-only"> {l.name}</span>
          </button>
          {!l.issue && l.maxQty > 0 && l.maxQty <= 5 && <span className="text-xs font-medium text-warning">Only {l.available} left</span>}
        </div>
      </div>
    </li>
  );
}

export function CartPage() {
  const navigate = useNavigate();
  const { data: cart, isLoading, isError } = useCart();

  if (isError) return <div className="mx-auto max-w-[720px] px-4 py-12"><Alert severity="error">We could not load your cart. Please refresh and try again.</Alert></div>;
  if (isLoading || !cart) {
    return <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-8 lg:grid-cols-[1fr_380px]"><Skeleton variant="rounded" height={320} /><Skeleton variant="rounded" height={280} /></div>;
  }
  if (cart.groups.length === 0) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-16">
        <EmptyState title="Your cart is empty" message="Browse the catalogue and add something you like." action={<Button component={Link} to="/" variant="contained">Continue shopping</Button>} />
      </div>
    );
  }

  const t = cart.totals;
  const blocker = cart.hasIssues
    ? 'Fix the highlighted items to continue.'
    : t.subtotalPaise < cart.minOrderPaise
      ? `Minimum order value is ${formatINR(cart.minOrderPaise)}. Add ${formatINR(cart.minOrderPaise - t.subtotalPaise)} more.`
      : null;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <h1 className="text-3xl">Shopping cart <span className="font-sans text-lg font-normal text-muted">({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'})</span></h1>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {cart.groups.map((g) => (
            <section key={g.sellerId} aria-label={`Items sold by ${g.store?.name ?? 'seller'}`} className="overflow-hidden rounded-lg border border-line bg-white">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas px-5 py-3 text-sm">
                <span>Sold by <Link to={g.store ? `/search?store=${g.store.slug}` : '#'} className="font-bold text-blue-600">{g.store?.name}</Link></span>
                <span className="text-xs text-muted">Shipment total {formatINR(g.subtotalPaise)}</span>
              </header>
              <ul className="divide-y divide-line">{g.items.map((l) => <Line key={l.id} l={l} />)}</ul>
              {g.subtotalPaise > 0 && (
                <footer className="border-t border-line px-5 py-3 text-sm">
                  {g.freeDelivery ? (
                    <p className="font-medium text-success">Free delivery on this shipment</p>
                  ) : (
                    <>
                      <p className="text-muted">Delivery {formatINR(g.deliveryPaise)} · add <strong className="text-ink">{formatINR(g.remainingForFreePaise)}</strong> more from this seller for free delivery</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zone" role="progressbar" aria-label="Progress to free delivery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((g.subtotalPaise / cart.freeDeliveryThresholdPaise) * 100)}>
                        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, (g.subtotalPaise / cart.freeDeliveryThresholdPaise) * 100)}%` }} />
                      </div>
                    </>
                  )}
                </footer>
              )}
            </section>
          ))}
        </div>

        <aside aria-labelledby="summary-heading" className="rounded-lg border border-line bg-white p-5 lg:sticky lg:top-[140px]">
          <h2 id="summary-heading" className="text-lg">Price details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">MRP total ({t.itemCount} {t.itemCount === 1 ? 'item' : 'items'})</dt><dd className="tabular-nums">{formatINR(t.mrpTotalPaise)}</dd></div>
            {t.savingsPaise > 0 && <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd className="font-mono text-success tabular-nums">− {formatINR(t.savingsPaise)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Items subtotal</dt><dd className="tabular-nums">{formatINR(t.subtotalPaise)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{t.deliveryPaise === 0 ? <span className="text-success">Free</span> : formatINR(t.deliveryPaise)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold"><dt>Total amount</dt><dd className="tabular-nums">{formatINR(t.grandTotalPaise)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-muted">Includes {formatINR(t.taxIncludedPaise)} GST. Prices are tax-inclusive.</p>
          {t.savingsPaise > 0 && <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-800">You will save {formatINR(t.savingsPaise)} on this order</p>}
          {blocker && <p role="alert" className="mt-3 text-sm font-medium text-danger">{blocker}</p>}
          <Button fullWidth variant="contained" size="large" disabled={!cart.canCheckout} onClick={() => navigate('/checkout')} sx={{ mt: 3, height: 52, bgcolor: '#F59E0B', color: '#24262A', '&:hover': { bgcolor: '#FBBF24' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground' } }}>
            Proceed to checkout
          </Button>
          <Link to="/" className="mt-3 block text-center text-sm font-bold text-blue-600">Continue shopping</Link>
        </aside>
      </div>
    </div>
  );
}
