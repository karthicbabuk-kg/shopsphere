import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import { FileText, ImageOff } from 'lucide-react';
import { CARRIERS } from '@shopsphere/shared-validation';
import { ReasonDialog } from '../../components/ReasonDialog';
import { AddressBlock, OrderStatusBadge, PAYMENT_LABEL, ProgressSteps, Timeline } from '../../features/orders/orderUi';
import { useSellerOrder, useSellerOrderAction } from '../../features/orders/ordersApi';
import { toast } from '../../store/toast';
import { cdn } from '../../utils/cdn';
import { formatDateTime, formatINR } from '../../utils/format';

const NEXT: Record<string, { label: string; done: string }> = {
  accept: { label: 'Accept order', done: 'Order accepted' },
  process: { label: 'Start processing', done: 'Marked as processing' },
  pack: { label: 'Mark as packed', done: 'Marked as packed' },
  deliver: { label: 'Mark as delivered', done: 'Marked as delivered' },
  approve_return: { label: 'Approve return', done: 'Return approved' },
  receive_return: { label: 'Mark return received', done: 'Return received and stock restocked' },
};

export function SellerOrderDetailPage() {
  const { id = '' } = useParams();
  const { data: o, isLoading, isError, error } = useSellerOrder(id);
  const act = useSellerOrderAction(id);
  const [dlg, setDlg] = useState<'ship' | 'cancel' | 'reject' | null>(null);
  const [carrier, setCarrier] = useState<string>(CARRIERS[0]);
  const [tracking, setTracking] = useState('');
  const close = () => setDlg(null);

  if (isError) return <div><Alert severity="error">{(error as Error).message}</Alert><Link to="/seller/orders" className="mt-4 inline-block font-medium text-blue-600">Back to orders</Link></div>;
  if (isLoading || !o) return <Skeleton variant="rounded" height={420} />;

  const run = (a: Parameters<typeof act.mutate>[0], message: string, after?: () => void) =>
    act.mutate(a, { onSuccess: () => { toast.success(message); after?.(); } });

  const primary = o.actions.filter((a) => NEXT[a]);

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted"><Link to="/seller/orders" className="hover:text-blue-600">Orders</Link> / <span className="font-mono">{o.orderNo}</span></nav>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Order <span className="font-mono text-2xl">{o.orderNo}</span></h1>
          <p className="mt-1 text-sm text-muted">Placed {formatDateTime(o.placedAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={o.status} />
          <Button component={Link} to={`/seller/orders/${o.id}/invoice`} size="small" color="inherit" startIcon={<FileText size={15} />}>Invoice</Button>
        </div>
      </div>

      {o.actions.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4" role="region" aria-label="Next steps">
          <span className="mr-auto text-sm font-medium">What happens next</span>
          {primary.map((a) => <Button key={a} variant="contained" disabled={act.isPending} onClick={() => run({ action: a } as never, NEXT[a]!.done)}>{NEXT[a]!.label}</Button>)}
          {o.actions.includes('ship') && <Button variant="contained" disabled={act.isPending} onClick={() => setDlg('ship')}>Ship order</Button>}
          {o.actions.includes('reject_return') && <Button color="error" variant="outlined" disabled={act.isPending} onClick={() => setDlg('reject')}>Reject return</Button>}
          {o.actions.includes('cancel') && <Button color="error" variant="outlined" disabled={act.isPending} onClick={() => setDlg('cancel')}>Cancel order</Button>}
        </div>
      )}

      {o.returnStatus && <Alert severity="info" sx={{ mb: 3 }}>Return {o.returnStatus.toLowerCase()}{o.returnReason ? `: “${o.returnReason}”` : ''}</Alert>}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <section className="rounded-xl border border-line bg-white p-5 sm:p-6" aria-label="Progress">
            <ProgressSteps status={o.status} />
            {o.trackingNo && <p className="mt-4 text-sm text-muted">{o.carrier} · Tracking <span className="font-mono text-ink">{o.trackingNo}</span></p>}
            {o.cancelReason && <p className="mt-3 text-sm text-muted">Cancelled: {o.cancelReason}</p>}
          </section>

          <section className="rounded-xl border border-line bg-white p-5 sm:p-6" aria-labelledby="so-items">
            <h2 id="so-items" className="mb-2 text-base">Items</h2>
            <ul className="divide-y divide-line">
              {o.items.map((i) => (
                <li key={i.id} className="flex gap-4 py-3">
                  <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-zone">
                    {i.image ? <img src={cdn(i.image, 112)} alt="" width={56} height={56} loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center"><ImageOff size={16} className="text-faint" /></span>}
                  </span>
                  <div className="min-w-0 flex-1"><p className="line-clamp-2 font-medium">{i.name}</p><p className="font-mono text-xs text-muted">{i.sku} · {formatINR(i.unitPricePaise)} × {i.quantity}</p></div>
                  <p className="font-medium tabular-nums">{formatINR(i.lineTotalPaise)}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-white p-5 sm:p-6" aria-labelledby="so-hist">
            <h2 id="so-hist" className="mb-3 text-base">History</h2>
            <Timeline items={o.timeline} />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="so-ship">
            <h2 id="so-ship" className="mb-3 text-base">Ship to</h2>
            <AddressBlock a={o.address as never} />
          </section>
          <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="so-money">
            <h2 id="so-money" className="mb-3 text-base">Payment and earnings</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Method</dt><dd>{o.payment ? PAYMENT_LABEL[o.payment.method] : '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Payment</dt><dd>{o.payment && <OrderStatusBadge status={o.payment.status} />}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Items</dt><dd className="tabular-nums">{formatINR(o.subtotalPaise)}</dd></div>
              {o.discountPaise > 0 && <div className="flex justify-between"><dt className="text-muted">Coupon share</dt><dd className="tabular-nums">− {formatINR(o.discountPaise)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{formatINR(o.deliveryPaise)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 font-bold"><dt>Buyer paid</dt><dd className="tabular-nums">{formatINR(o.totalPaise)}</dd></div>
              {o.commission && (
                <>
                  <div className="flex justify-between text-muted"><dt>Platform fee ({o.commission.rateBp / 100}%)</dt><dd className="tabular-nums">− {formatINR(o.commission.amountPaise)}</dd></div>
                  <div className="flex justify-between font-medium"><dt>Your earnings</dt><dd className="tabular-nums">{formatINR(o.commission.netSellerPaise)}</dd></div>
                </>
              )}
              {o.refundedPaise > 0 && <div className="flex justify-between text-danger"><dt>Refunded to buyer</dt><dd className="tabular-nums">{formatINR(o.refundedPaise)}</dd></div>}
            </dl>
          </section>
        </aside>
      </div>

      <Dialog open={dlg === 'ship'} onClose={act.isPending ? undefined : close} fullWidth maxWidth="xs">
        <form onSubmit={(e) => { e.preventDefault(); run({ action: 'ship', carrier: carrier as (typeof CARRIERS)[number], trackingNo: tracking.trim() || undefined }, 'Order shipped', close); }}>
          <DialogTitle>Ship this order</DialogTitle>
          <DialogContent>
            <p className="mb-4 text-sm text-muted">Stock moves from reserved to sold. The buyer is notified with the tracking number. Leave the tracking number empty to generate a demo one.</p>
            <TextField select fullWidth label="Carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} sx={{ mb: 2 }}>
              {CARRIERS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <TextField fullWidth label="Tracking number (optional)" value={tracking} onChange={(e) => setTracking(e.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }} />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={close} color="inherit" disabled={act.isPending}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={act.isPending}>{act.isPending ? 'Working…' : 'Mark as shipped'}</Button>
          </DialogActions>
        </form>
      </Dialog>
      <ReasonDialog open={dlg === 'cancel'} title="Cancel this order?" description="Stock is released and the buyer is refunded if they paid. The buyer sees your reason." confirmLabel="Cancel order" busy={act.isPending} onClose={close} onConfirm={(reason) => run({ action: 'cancel', reason }, 'Order cancelled', close)} />
      <ReasonDialog open={dlg === 'reject'} title="Reject this return?" description="The shipment goes back to delivered. The buyer sees your reason and cannot request another return." confirmLabel="Reject return" busy={act.isPending} onClose={close} onConfirm={(reason) => run({ action: 'reject_return', reason }, 'Return rejected', close)} />
    </div>
  );
}
