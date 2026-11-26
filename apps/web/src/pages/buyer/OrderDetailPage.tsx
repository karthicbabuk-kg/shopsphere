import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { CheckCircle2, FileText, ImageOff, Star } from 'lucide-react';
import { ReasonDialog } from '../../components/ReasonDialog';
import { AddressBlock, OrderStatusBadge, PAYMENT_LABEL, ProgressSteps, Timeline } from '../../features/orders/orderUi';
import { useOrder, useOrderActions, type Shipment } from '../../features/orders/ordersApi';
import { cdn } from '../../utils/cdn';
import { formatDate, formatDateTime, formatINR } from '../../utils/format';

type Dialog = { kind: 'cancel-order' } | { kind: 'cancel' | 'return'; shipment: Shipment } | null;

const RETURN_TEXT = {
  REQUESTED: 'Return requested. Waiting for the seller to approve it.',
  APPROVED: 'Return approved. Send the item back to the seller; your refund follows once it is received.',
  REJECTED: 'The seller declined this return.',
  RECEIVED: 'Return received and refunded.',
} as const;

function ShipmentCard({ orderId, orderNo, s, index, total, onCancel, onReturn }: {
  orderId: string; orderNo: string; s: Shipment; index: number; total: number;
  onCancel: () => void; onReturn: () => void;
}) {
  return (
    <article className="rounded-xl border border-line bg-white p-5 sm:p-6" aria-label={`Shipment ${index + 1}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base">{total > 1 ? `Shipment ${index + 1} of ${total} · ` : ''}Sold by {s.store?.name ?? s.businessName}</h3>
          {s.trackingNo && <p className="mt-1 text-sm text-muted">{s.carrier} · Tracking <span className="font-mono text-ink">{s.trackingNo}</span></p>}
        </div>
        <OrderStatusBadge status={s.status} />
      </header>

      <div className="mt-5"><ProgressSteps status={s.status} /></div>

      {s.status === 'CANCELLED' && s.cancelReason && <p className="mt-3 text-sm text-muted">Reason: {s.cancelReason}{s.refundedPaise > 0 && <> · <strong className="text-ink">{formatINR(s.refundedPaise)} refunded</strong></>}</p>}
      {s.returnStatus && <Alert severity={s.returnStatus === 'REJECTED' ? 'warning' : 'info'} sx={{ mt: 3 }}>{RETURN_TEXT[s.returnStatus]}{s.returnReason && s.returnStatus === 'REQUESTED' ? ` Your reason: ${s.returnReason}` : ''}</Alert>}

      <ul className="mt-5 divide-y divide-line">
        {s.items.map((i) => (
          <li key={i.id} className="flex gap-4 py-3">
            <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-zone">
              {i.image ? <img src={cdn(i.image, 128)} alt="" width={64} height={64} loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center"><ImageOff size={16} className="text-faint" /></span>}
            </span>
            <div className="min-w-0 flex-1">
              {i.slug ? <Link to={`/p/${i.slug}`} className="line-clamp-2 font-medium hover:text-blue-600">{i.name}</Link> : <span className="font-medium">{i.name}</span>}
              <p className="text-sm text-muted tabular-nums">{formatINR(i.unitPricePaise)} × {i.quantity}</p>
              {s.status === 'DELIVERED' && i.slug && (
                <Link to={`/p/${i.slug}?tab=reviews`} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"><Star size={14} aria-hidden="true" /> Write a review</Link>
              )}
            </div>
            <p className="font-medium tabular-nums">{formatINR(i.lineTotalPaise)}</p>
          </li>
        ))}
      </ul>

      <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Items</dt><dd className="tabular-nums">{formatINR(s.subtotalPaise)}</dd></div>
        {s.discountPaise > 0 && <div className="flex justify-between text-success"><dt>Coupon share</dt><dd className="tabular-nums">− {formatINR(s.discountPaise)}</dd></div>}
        <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{s.deliveryPaise === 0 ? 'Free' : formatINR(s.deliveryPaise)}</dd></div>
        <div className="flex justify-between font-bold"><dt>Shipment total</dt><dd className="tabular-nums">{formatINR(s.totalPaise)}</dd></div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {s.canCancel && <Button size="small" variant="outlined" color="error" onClick={onCancel}>Cancel shipment</Button>}
        {s.canReturn && <Button size="small" variant="outlined" onClick={onReturn}>Return items</Button>}
        {s.status !== 'CANCELLED' && (
          <Button size="small" color="inherit" component={Link} to={`/account/orders/${orderId}/invoice/${s.id}`} startIcon={<FileText size={15} />} aria-label={`Invoice for ${orderNo}, shipment ${index + 1}`}>Invoice</Button>
        )}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-blue-600">Tracking history</summary>
        <div className="mt-3"><Timeline items={s.timeline} /></div>
      </details>
    </article>
  );
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const justPlaced = (useLocation().state as { placed?: boolean } | null)?.placed;
  const { data: o, isLoading, isError, error } = useOrder(id);
  const actions = useOrderActions(id);
  const [dlg, setDlg] = useState<Dialog>(null);

  if (isError) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-16">
        <Alert severity="error">{(error as Error).message}</Alert>
        <Link to="/account/orders" className="mt-4 inline-block font-medium text-blue-600">Back to my orders</Link>
      </div>
    );
  }
  if (isLoading || !o) return <div className="mx-auto grid max-w-[1080px] gap-6 px-5 py-10 lg:grid-cols-[1fr_340px]"><Skeleton variant="rounded" height={360} /><Skeleton variant="rounded" height={260} /></div>;

  const anyCancellable = o.shipments.some((s) => s.canCancel);
  const busy = actions.cancelOrder.isPending || actions.cancelShipment.isPending || actions.requestReturn.isPending;
  const close = () => setDlg(null);

  return (
    <div className="mx-auto max-w-[1080px] px-5 py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted"><Link to="/account/orders" className="hover:text-blue-600">My orders</Link> / <span className="font-mono">{o.orderNo}</span></nav>

      {justPlaced && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-xl bg-green-50 p-5 text-green-900">
          <CheckCircle2 className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-lg">Thank you, your order is placed</h2>
            <p className="text-sm">{o.payment?.method === 'COD' ? 'Pay in cash when it arrives.' : 'Your demo payment was successful.'} We have notified {o.shipments.length === 1 ? 'the seller' : `all ${o.shipments.length} sellers`}.</p>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Order <span className="font-mono text-2xl">{o.orderNo}</span></h1>
          <p className="mt-1 text-sm text-muted">Placed {formatDateTime(o.placedAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={o.status} />
          {anyCancellable && <Button size="small" variant="outlined" color="error" onClick={() => setDlg({ kind: 'cancel-order' })}>Cancel order</Button>}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {o.shipments.map((s, i) => (
            <ShipmentCard key={s.id} orderId={o.id} orderNo={o.orderNo} s={s} index={i} total={o.shipments.length}
              onCancel={() => setDlg({ kind: 'cancel', shipment: s })} onReturn={() => setDlg({ kind: 'return', shipment: s })} />
          ))}
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="o-addr">
            <h2 id="o-addr" className="mb-3 text-base">Delivery address</h2>
            <AddressBlock a={o.address} />
          </section>
          <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="o-pay">
            <h2 id="o-pay" className="mb-3 text-base">Payment</h2>
            {o.payment && (
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted">Method</dt><dd>{PAYMENT_LABEL[o.payment.method]}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd><OrderStatusBadge status={o.payment.status} /></dd></div>
                {o.payment.reference && <div className="flex justify-between gap-3"><dt className="text-muted">Reference</dt><dd className="font-mono text-xs">{o.payment.reference}</dd></div>}
              </dl>
            )}
          </section>
          <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="o-sum">
            <h2 id="o-sum" className="mb-3 text-base">Order total</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Items</dt><dd className="tabular-nums">{formatINR(o.subtotalPaise)}</dd></div>
              {o.discountPaise > 0 && <div className="flex justify-between text-success"><dt>Coupon {o.coupon?.code}</dt><dd className="tabular-nums">− {formatINR(o.discountPaise)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{o.deliveryPaise === 0 ? 'Free' : formatINR(o.deliveryPaise)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatINR(o.totalPaise)}</dd></div>
              <div className="flex justify-between text-xs text-muted"><dt>Includes GST</dt><dd className="tabular-nums">{formatINR(o.taxPaise)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-faint">Placed on {formatDate(o.placedAt)}</p>
          </section>
        </aside>
      </div>

      <ReasonDialog
        open={dlg?.kind === 'cancel-order'}
        title="Cancel this order?"
        description="Every shipment that has not been dispatched will be cancelled and any payment refunded. Shipments already on their way are not affected."
        confirmLabel="Cancel order"
        busy={busy}
        onClose={close}
        onConfirm={(reason) => actions.cancelOrder.mutate(reason, { onSuccess: close })}
      />
      <ReasonDialog
        open={dlg?.kind === 'cancel'}
        title="Cancel this shipment?"
        description="Items from this seller will be cancelled and returned to stock. Any payment is refunded."
        confirmLabel="Cancel shipment"
        busy={busy}
        onClose={close}
        onConfirm={(reason) => dlg && 'shipment' in dlg && actions.cancelShipment.mutate({ sid: dlg.shipment.id, reason }, { onSuccess: close })}
      />
      <ReasonDialog
        open={dlg?.kind === 'return'}
        title="Return these items"
        description="Tell the seller why you are returning them. You have 7 days from delivery. Your refund is recorded once the seller receives the items."
        confirmLabel="Request return"
        busy={busy}
        onClose={close}
        onConfirm={(reason) => dlg && 'shipment' in dlg && actions.requestReturn.mutate({ sid: dlg.shipment.id, reason }, { onSuccess: close })}
      />
    </div>
  );
}
