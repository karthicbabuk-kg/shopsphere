import { Link, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import { AddressBlock, OrderStatusBadge, PAYMENT_LABEL, Timeline } from '../../features/orders/orderUi';
import { useAdminOrder } from '../../features/reports/reportsApi';
import { formatDateTime, formatINR } from '../../utils/format';

export function AdminOrderDetailPage() {
  const { id = '' } = useParams();
  const { data: o, isLoading, isError, error } = useAdminOrder(id);
  if (isError) return <div><Alert severity="error">{(error as Error).message}</Alert><Link to="/admin/orders" className="mt-4 inline-block font-medium text-blue-600">Back to orders</Link></div>;
  if (isLoading || !o) return <Skeleton variant="rounded" height={420} />;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted"><Link to="/admin/orders" className="hover:text-blue-600">Orders</Link> / <span className="font-mono">{o.orderNo}</span></nav>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Order <span className="font-mono text-2xl">{o.orderNo}</span></h1>
          <p className="mt-1 text-sm text-muted">Placed {formatDateTime(o.placedAt)} by {o.buyer.name} ({o.buyer.email})</p>
        </div>
        <OrderStatusBadge status={o.status} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {o.shipments.map((s, i) => (
            <article key={s.id} className="rounded-xl border border-line bg-white p-5 sm:p-6" aria-label={`Shipment ${i + 1}`}>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base">Shipment {i + 1} · {s.store?.name ?? s.businessName}</h2>
                  {s.trackingNo && <p className="mt-1 text-sm text-muted">{s.carrier} · <span className="font-mono">{s.trackingNo}</span></p>}
                </div>
                <OrderStatusBadge status={s.status} />
              </header>
              <ul className="mt-4 divide-y divide-line text-sm">
                {s.items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-4 py-2"><span className="min-w-0">{it.name}<span className="block font-mono text-xs text-muted">{it.sku} · {formatINR(it.unitPricePaise)} × {it.quantity}</span></span><span className="font-medium tabular-nums">{formatINR(it.lineTotalPaise)}</span></li>
                ))}
              </ul>
              <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Shipment total</dt><dd className="font-bold tabular-nums">{formatINR(s.totalPaise)}</dd></div>
                {s.commission ? (
                  <>
                    <div className="flex justify-between"><dt className="text-muted">Commission ({s.commission.rateBp / 100}%)</dt><dd className="tabular-nums">{formatINR(s.commission.amountPaise)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Seller net</dt><dd className="tabular-nums">{formatINR(s.commission.netSellerPaise)}</dd></div>
                  </>
                ) : <div className="flex justify-between"><dt className="text-muted">Commission</dt><dd className="text-muted">None (cancelled or returned)</dd></div>}
                {s.refundedPaise > 0 && <div className="flex justify-between text-danger"><dt>Refunded</dt><dd className="tabular-nums">{formatINR(s.refundedPaise)}</dd></div>}
              </dl>
              <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-blue-600">History</summary><div className="mt-3"><Timeline items={s.timeline} /></div></details>
            </article>
          ))}
        </div>
        <aside className="space-y-5">
          <section className="rounded-xl border border-line bg-white p-5"><h2 className="mb-3 text-base">Delivery address</h2><AddressBlock a={o.address} /></section>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="mb-3 text-base">Payment and totals</h2>
            <dl className="space-y-1.5 text-sm">
              {o.payment && <><div className="flex justify-between"><dt className="text-muted">Method</dt><dd>{PAYMENT_LABEL[o.payment.method]}</dd></div><div className="flex justify-between"><dt className="text-muted">Status</dt><dd><OrderStatusBadge status={o.payment.status} /></dd></div></>}
              <div className="flex justify-between"><dt className="text-muted">Items</dt><dd className="tabular-nums">{formatINR(o.subtotalPaise)}</dd></div>
              {o.discountPaise > 0 && <div className="flex justify-between"><dt className="text-muted">Coupon {o.coupon?.code}</dt><dd className="tabular-nums">− {formatINR(o.discountPaise)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{formatINR(o.deliveryPaise)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 font-bold"><dt>Total</dt><dd className="tabular-nums">{formatINR(o.totalPaise)}</dd></div>
              <div className="flex justify-between text-xs text-muted"><dt>GST included</dt><dd className="tabular-nums">{formatINR(o.taxPaise)}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
