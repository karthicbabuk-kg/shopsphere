import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { Download } from 'lucide-react';
import { OrdersBars, RankedBars, SalesChart } from '../../components/charts/Charts';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { RangeTabs, readable } from '../../features/reports/RangeTabs';
import { downloadCsv, useSellerReport, useSellerSettlements } from '../../features/reports/reportsApi';
import { formatDate, formatINR, formatINRWhole } from '../../utils/format';

export function SellerReportsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError, isFetching } = useSellerReport(days);
  const { data: settlements } = useSellerSettlements();
  const [busy, setBusy] = useState(false);

  if (isError) return <Alert severity="error">Could not load your reports.</Alert>;
  if (isLoading || !data) return <><PageHeader title="Reports" /><Skeleton variant="rounded" height={420} /></>;
  const k = data.kpis;

  return (
    <div className={isFetching ? 'opacity-80 transition-opacity' : ''}>
      <PageHeader
        title="Reports"
        subtitle="Sales and earnings from orders that were not cancelled or returned."
        actions={
          <Button variant="outlined" startIcon={<Download size={16} />} disabled={busy} onClick={async () => { setBusy(true); await downloadCsv('/seller/reports/orders.csv', { days }); setBusy(false); }}>
            Export orders (CSV)
          </Button>
        }
      />
      <div className="mb-5"><RangeTabs value={days} onChange={setDays} /></div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales" value={formatINRWhole(k.salesPaise)} hint={`${k.orders} ${k.orders === 1 ? 'order' : 'orders'}`} />
        <StatCard label="Your earnings" value={formatINRWhole(k.netToSellersPaise)} hint={`After ${formatINRWhole(k.commissionPaise)} platform fee`} />
        <StatCard label="Units sold" value={k.units} hint={`Average order ${formatINRWhole(k.avgOrderPaise)}`} />
        <StatCard label="To fulfil now" value={k.pendingFulfilment} accent={k.pendingFulfilment > 0} hint={`${k.cancelled} cancelled · ${k.returned} returned`} />
      </div>

      <section className="mt-6 rounded-lg border border-line bg-white p-5" aria-labelledby="sales-h">
        <h2 id="sales-h" className="mb-3 text-lg">Daily sales</h2>
        {k.orders === 0 ? <EmptyState title="No sales in this period" message="Sales appear here once buyers order your products." /> : (
          <>
            <SalesChart data={data.series} />
            <h3 className="mb-1 mt-4 text-sm text-muted">Orders per day</h3>
            <OrdersBars data={data.series} />
          </>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="top-h">
          <h2 id="top-h" className="mb-4 text-lg">Top items</h2>
          {data.topItems.length === 0 ? <p className="text-sm text-muted">Nothing sold yet.</p> : (
            <RankedBars label="Top items by sales" rows={data.topItems.map((t) => ({ name: t.name, value: t.salesPaise, hint: `${t.units} ${t.units === 1 ? 'unit' : 'units'}` }))} />
          )}
        </section>
        <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="pay-h">
          <h2 id="pay-h" className="mb-4 text-lg">Payouts</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Delivered, ready to settle</dt><dd className="font-medium tabular-nums">{formatINR(data.payouts.readyToSettlePaise)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">In a pending settlement</dt><dd className="font-medium tabular-nums">{formatINR(data.payouts.inPendingSettlementPaise)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Paid out</dt><dd className="font-medium tabular-nums">{formatINR(data.payouts.paidPaise)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-faint">Settlements are prepared by the platform administrator. Payouts here are a demo and move no real money.</p>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-line bg-white p-5" aria-labelledby="status-h">
        <h2 id="status-h" className="mb-4 text-lg">Orders by status</h2>
        {data.statusBreakdown.length === 0 ? <p className="text-sm text-muted">No orders in this period.</p> : (
          <RankedBars label="Orders by status" format={(n) => String(n)} rows={data.statusBreakdown.map((s) => ({ name: readable(s.status), value: s.count }))} />
        )}
      </section>

      <section className="mt-6" aria-labelledby="set-h">
        <h2 id="set-h" className="mb-3 text-lg">Settlement statements</h2>
        {!settlements || settlements.length === 0 ? <EmptyState title="No settlements yet" message="Once delivered orders are settled you will see the statement here." /> : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
                <tr><th className="px-5 py-3 font-medium">Created</th><th className="px-5 py-3 font-medium">Orders</th><th className="px-5 py-3 text-right font-medium">Gross</th><th className="px-5 py-3 text-right font-medium">Platform fee</th><th className="px-5 py-3 text-right font-medium">Net payout</th><th className="px-5 py-3 font-medium">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3">{formatDate(s.createdAt)}</td>
                    <td className="px-5 py-3 tabular-nums">{s._count?.commissions ?? '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatINR(s.grossPaise)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatINR(s.commissionPaise)}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">{formatINR(s.netPaise)}</td>
                    <td className="px-5 py-3"><StatusBadge status={s.status} tone={s.status === 'PAID' ? 'success' : 'warning'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
