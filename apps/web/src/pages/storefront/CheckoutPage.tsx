import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Banknote, CreditCard, MapPin, Plus, Smartphone, Tag, Truck } from 'lucide-react';
import type { PaymentMethodCode } from '@shopsphere/shared-validation';
import { AddressDialog } from '../../features/orders/AddressDialog';
import { AddressBlock } from '../../features/orders/orderUi';
import { fetchQuote, placeOrder, useAddresses, useQuote } from '../../features/orders/ordersApi';
import { useCoupons } from '../../features/storefront/storeApi';
import { ApiRequestError } from '../../services/api';
import { toast } from '../../store/toast';
import { formatINR } from '../../utils/format';

const METHODS: { code: PaymentMethodCode; label: string; hint: string; icon: typeof Smartphone }[] = [
  { code: 'UPI', label: 'UPI', hint: 'Pay with any UPI app (demo)', icon: Smartphone },
  { code: 'CARD', label: 'Credit / debit card', hint: 'Simulated – no card details are collected', icon: CreditCard },
  { code: 'COD', label: 'Cash on delivery', hint: 'Pay when your order arrives', icon: Banknote },
];

function Section({ n, title, icon: Icon, children }: { n: number; title: string; icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5 sm:p-6" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="mb-4 flex items-center gap-2.5 text-lg">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-700" aria-hidden="true">{n}</span>
        <Icon size={18} className="text-muted" aria-hidden="true" /> {title}
      </h2>
      {children}
    </section>
  );
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: addresses, isLoading: addrLoading } = useAddresses();
  const { data: offers } = useCoupons();

  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState<PaymentMethodCode>('UPI');
  const [outcome, setOutcome] = useState<'SUCCESS' | 'FAIL'>('SUCCESS');
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<string | undefined>();
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  // One key per checkout visit: a retry after a dropped connection can never create a second order.
  const idemKey = useRef(crypto.randomUUID());
  const placed = useRef(false);

  const quote = useQuote(applied);

  useEffect(() => {
    if (!addressId && addresses?.length) setAddressId((addresses.find((a) => a.isDefault) ?? addresses[0])!.id);
  }, [addresses, addressId]);

  // If an applied coupon stops being valid (cart changed), drop it and say why.
  useEffect(() => {
    if (applied && quote.isError) {
      toast.error((quote.error as Error).message);
      setApplied(undefined);
    }
  }, [applied, quote.isError, quote.error]);

  const q = quote.data;
  const codBlocked = q ? !q.codAvailable : false;
  useEffect(() => {
    if (codBlocked && method === 'COD') setMethod('UPI');
  }, [codBlocked, method]);

  const applyCoupon = async (raw: string) => {
    const c = raw.trim().toUpperCase();
    if (!c) return setCouponError('Enter a coupon code');
    setApplying(true);
    setCouponError(null);
    try {
      await fetchQuote(c);
      setApplied(c);
      setCode('');
      toast.success(`${c} applied`);
    } catch (e) {
      setCouponError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const place = useMutation({
    mutationFn: () =>
      placeOrder(
        { addressId: addressId!, paymentMethod: method, couponCode: applied, demoOutcome: outcome, expectedTotalPaise: q?.totalPaise },
        idemKey.current,
      ),
    onSuccess: ({ order }) => {
      placed.current = true;
      navigate(`/account/orders/${order.id}`, { replace: true, state: { placed: true } });
      void qc.invalidateQueries({ queryKey: ['cart'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e: Error) => {
      const err = e as ApiRequestError;
      if (err.code === 'PAYMENT_FAILED') return setPayError(err.message);
      if (err.code === 'CONFLICT') {
        void qc.invalidateQueries({ queryKey: ['checkout'] });
        void qc.invalidateQueries({ queryKey: ['cart'] });
      }
      toast.error(err.message);
    },
  });

  const unavailableOffers = useMemo(() => (offers ?? []).filter((o) => o.code !== applied), [offers, applied]);

  if (quote.isLoading || addrLoading || !q) {
    if (quote.isError && !applied) return <Navigate to="/cart" replace />;
    return <div className="mx-auto grid max-w-[1180px] gap-6 px-4 py-8 lg:grid-cols-[1fr_380px]"><Skeleton variant="rounded" height={420} /><Skeleton variant="rounded" height={320} /></div>;
  }
  if (!q.canCheckout && !placed.current) return <Navigate to="/cart" replace />;

  const canPlace = !!addressId && !place.isPending && q.canCheckout;

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8">
      <h1 className="text-3xl">Checkout</h1>
      <p className="mt-1 text-sm text-muted">Review your order, then place it. This is a demo store: no real payment is taken.</p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Section n={1} title="Delivery address" icon={MapPin}>
            {addresses && addresses.length > 0 ? (
              <fieldset>
                <legend className="sr-only">Choose a delivery address</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {addresses.map((a) => (
                    <label key={a.id} className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${addressId === a.id ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600' : 'border-line hover:border-faint'}`}>
                      <input type="radio" name="address" className="mt-1 accent-blue-600" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                      <span className="min-w-0">
                        <span className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">{a.label}{a.isDefault && <span className="rounded bg-zone px-1.5 py-0.5 normal-case tracking-normal">Default</span>}</span>
                        <AddressBlock a={a} />
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <p className="text-sm text-muted">You have no saved addresses yet. Add one to continue.</p>
            )}
            <Button sx={{ mt: 2 }} variant="outlined" startIcon={<Plus size={16} />} onClick={() => setAdding(true)}>Add a new address</Button>
          </Section>

          <Section n={2} title="Delivery" icon={Truck}>
            <p className="mb-3 text-sm text-muted">Each seller ships separately, so your order arrives in {q.shipments.length} {q.shipments.length === 1 ? 'shipment' : 'shipments'}. Estimated delivery 3–7 days (demo estimate).</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {q.shipments.map((s) => (
                <li key={s.sellerId} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                  <span><strong>{s.store?.name ?? 'Seller'}</strong> · {s.itemCount} {s.itemCount === 1 ? 'item' : 'items'}</span>
                  <span className="tabular-nums">{s.deliveryPaise === 0 ? <span className="font-medium text-success">Free delivery</span> : `Delivery ${formatINR(s.deliveryPaise)}`}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm"><Link to="/cart" className="font-medium text-blue-600 hover:underline">Edit cart</Link></p>
          </Section>

          <Section n={3} title="Coupon" icon={Tag}>
            {q.coupon ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-green-50 p-4 text-sm">
                <span><strong className="font-mono">{q.coupon.code}</strong> applied · you save <strong>{formatINR(q.coupon.discountPaise)}</strong></span>
                <Button size="small" color="inherit" onClick={() => setApplied(undefined)}>Remove</Button>
              </div>
            ) : (
              <>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void applyCoupon(code); }}>
                  <TextField size="small" label="Coupon code" value={code} onChange={(e) => { setCode(e.target.value); setCouponError(null); }} error={!!couponError} helperText={couponError ?? ' '} slotProps={{ htmlInput: { maxLength: 30, autoCapitalize: 'characters' } }} sx={{ flex: 1, maxWidth: 280 }} />
                  <Button type="submit" variant="outlined" disabled={applying} sx={{ height: 40 }}>{applying ? 'Checking…' : 'Apply'}</Button>
                </form>
                {unavailableOffers.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2" aria-label="Available offers">
                    {unavailableOffers.map((o) => (
                      <button key={o.code} type="button" onClick={() => void applyCoupon(o.code)} className="rounded-lg border border-dashed border-blue-600 px-3 py-1.5 text-left text-xs hover:bg-blue-50">
                        <span className="font-mono font-bold text-blue-700">{o.code}</span>
                        <span className="block text-muted">{o.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Section>

          <Section n={4} title="Payment" icon={CreditCard}>
            <fieldset>
              <legend className="sr-only">Payment method</legend>
              <div className="space-y-3">
                {METHODS.map((m) => {
                  const off = m.code === 'COD' && codBlocked;
                  return (
                    <label key={m.code} className={`flex gap-3 rounded-lg border p-4 ${off ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${method === m.code ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600' : 'border-line hover:border-faint'}`}>
                      <input type="radio" name="pay" className="mt-1 accent-blue-600" disabled={off} checked={method === m.code} onChange={() => { setMethod(m.code); setPayError(null); }} />
                      <m.icon size={20} className="mt-0.5 text-muted" aria-hidden="true" />
                      <span><span className="block font-medium">{m.label}</span><span className="text-sm text-muted">{off ? 'Not available for orders above ₹50,000' : m.hint}</span></span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {method !== 'COD' && (
              <div className="mt-4 rounded-lg bg-zone p-4">
                <p className="text-sm font-medium">Demo payment simulator</p>
                <p className="mt-1 text-sm text-muted">No money moves. Pick the result the demo gateway should return to see both outcomes.</p>
                <TextField select size="small" label="Simulated result" value={outcome} onChange={(e) => { setOutcome(e.target.value as 'SUCCESS' | 'FAIL'); setPayError(null); }} sx={{ mt: 2, minWidth: 240, bgcolor: 'white' }}>
                  <MenuItem value="SUCCESS">Payment succeeds</MenuItem>
                  <MenuItem value="FAIL">Payment is declined</MenuItem>
                </TextField>
              </div>
            )}
            {payError && <Alert severity="error" sx={{ mt: 2 }}>{payError}</Alert>}
          </Section>
        </div>

        <aside className="rounded-xl border border-line bg-white p-5 sm:p-6 lg:sticky lg:top-24" aria-label="Order summary">
          <h2 className="text-lg">Order summary</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Items ({q.itemCount})</dt><dd className="tabular-nums">{formatINR(q.subtotalPaise)}</dd></div>
            {q.discountPaise > 0 && <div className="flex justify-between text-success"><dt>Coupon {q.coupon?.code}</dt><dd className="tabular-nums">− {formatINR(q.discountPaise)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{q.deliveryPaise === 0 ? 'Free' : formatINR(q.deliveryPaise)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatINR(q.totalPaise)}</dd></div>
            <div className="flex justify-between text-xs text-muted"><dt>Includes GST</dt><dd className="tabular-nums">{formatINR(q.taxIncludedPaise)}</dd></div>
          </dl>
          {q.savingsPaise > 0 && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-800">You save {formatINR(q.savingsPaise)} on this order</p>}
          <Button fullWidth size="large" variant="contained" sx={{ mt: 4 }} disabled={!canPlace} onClick={() => { setPayError(null); place.mutate(); }}>
            {place.isPending ? 'Placing order…' : method === 'COD' ? 'Place order' : `Pay ${formatINR(q.totalPaise)} (demo)`}
          </Button>
          {!addressId && <p className="mt-2 text-center text-xs text-danger">Choose a delivery address to continue</p>}
          <p className="mt-3 text-center text-xs text-faint">By placing the order you agree this is a demonstration store.</p>
        </aside>
      </div>

      <AddressDialog open={adding} onClose={() => setAdding(false)} onSaved={(a) => setAddressId(a.id)} />
    </div>
  );
}
