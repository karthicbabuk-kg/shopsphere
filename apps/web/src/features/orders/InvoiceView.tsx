import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import { ArrowLeft, Printer } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { formatDate, formatINR } from '../../utils/format';
import { PAYMENT_LABEL } from './orderUi';
import type { AddressSnapshot, Shipment } from './ordersApi';

/**
 * Print-friendly tax invoice for one shipment. Prices are GST-inclusive, so the tax shown is the
 * portion already contained in the total (same rounding as the order itself).
 */
export function InvoiceView({
  shipment: s,
  orderNo,
  placedAt,
  address,
  payment,
  backTo,
}: {
  shipment: Shipment;
  orderNo: string;
  placedAt: string;
  address: AddressSnapshot;
  payment: { method: 'UPI' | 'CARD' | 'COD'; status: string } | null;
  backTo: string;
}) {
  return (
    <div className="min-h-screen bg-zone py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <Button component={Link} to={backTo} color="inherit" startIcon={<ArrowLeft size={16} />}>Back</Button>
        <Button variant="contained" startIcon={<Printer size={16} />} onClick={() => window.print()}>Print / save as PDF</Button>
      </div>

      <article className="mx-auto max-w-[820px] rounded-xl border border-line bg-white p-6 sm:p-10 print:rounded-none print:border-0 print:p-0" aria-label={`Invoice ${s.invoiceNo}`}>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div><Logo /><p className="mt-2 text-xs text-muted">Marketplace demonstration – not a legal tax document</p></div>
          <div className="text-right text-sm">
            <h1 className="text-2xl">Tax invoice</h1>
            <p className="font-mono">{s.invoiceNo}</p>
            <p className="text-muted">Order {orderNo} · {formatDate(placedAt)}</p>
          </div>
        </header>

        <section className="grid gap-6 py-6 text-sm sm:grid-cols-2">
          <div>
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Sold by</h2>
            <p className="font-medium">{s.businessName}</p>
            {s.store && <p className="text-muted">{s.store.name}</p>}
            {s.gstin && <p className="font-mono text-xs">GSTIN {s.gstin}</p>}
          </div>
          <div>
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Billed and shipped to</h2>
            <address className="not-italic leading-relaxed">
              <strong>{address.name}</strong><br />
              {address.line1}{address.line2 ? `, ${address.line2}` : ''}<br />
              {address.city}, {address.state} {address.pincode}<br />
              {address.phone}
            </address>
          </div>
        </section>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="sr-only">Items on this invoice</caption>
            <thead>
              <tr className="border-y border-line bg-zone text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-3 py-2">Item</th>
                <th scope="col" className="px-3 py-2 text-right">Unit price</th>
                <th scope="col" className="px-3 py-2 text-right">Qty</th>
                <th scope="col" className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {s.items.map((i) => (
                <tr key={i.id} className="border-b border-line align-top">
                  <td className="px-3 py-3"><span className="font-medium">{i.name}</span><br /><span className="font-mono text-xs text-muted">{i.sku}</span></td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatINR(i.unitPricePaise)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{i.quantity}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatINR(i.lineTotalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto mt-6 max-w-[320px] space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Items</dt><dd className="tabular-nums">{formatINR(s.subtotalPaise)}</dd></div>
          {s.discountPaise > 0 && <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd className="tabular-nums">− {formatINR(s.discountPaise)}</dd></div>}
          <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{formatINR(s.deliveryPaise)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatINR(s.totalPaise)}</dd></div>
          <div className="flex justify-between text-xs text-muted"><dt>of which GST (inclusive)</dt><dd className="tabular-nums">{formatINR(s.taxPaise)}</dd></div>
        </dl>

        <footer className="mt-8 border-t border-line pt-4 text-xs text-muted">
          {payment && <p>Payment: {PAYMENT_LABEL[payment.method]} · {payment.status.charAt(0) + payment.status.slice(1).toLowerCase().replace(/_/g, ' ')}</p>}
          <p className="mt-1">All amounts in Indian rupees. Demo payments only; no real money moved.</p>
        </footer>
      </article>
    </div>
  );
}
