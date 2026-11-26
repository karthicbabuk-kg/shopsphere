import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { Download } from 'lucide-react';
import { OrdersBars, RankedBars, SalesChart } from '../../components/charts/Charts';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { RangeTabs, readable } from '../../features/reports/RangeTabs';
import { downloadCsv, useAdminReport } from '../../features/reports/reportsApi';
import { formatINRWhole } from '../../utils/format';

export function AdminReportsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError, isFetching } = useAdminReport(days);
  const [busy, setBusy] = useState<string | null>(null);
  const dl = async (key: string, path: string, params?: Record<string, unknown>) => { setBusy(key); await downloadCsv(path, params); setBusy(null); };

  if (isError) return <Alert severity="error">Could not load platform reports.</Alert>;
  if (isLoading || !data) return <><PageHeader title="Reports" /><Skeleton variant="rounded" height={420} /></>;
  const k = data.kpis;
  const inv = data.inventory;

  return (
    <div className={isFetching ? 'opacity-80 transition-opacity' : ''}>
      <PageHeader
        title="Reports"
        subtitle="Platform sales, commission and stock. Cancelled and returned shipments are excluded."
        actions={
          <>
            <Button variant="outlined" startIcon={<Download size={16} />} disabled={busy !== null} onClick={() => dl('o', '/admin/reports/orders.csv', { days })}>Orders CSV</Button>
            <Button variant="outlined" startIcon={<Download size={16} />} disabled={busy !== null} onClick={() => dl('c', '/admin/reports/commissions.csv')}>Commissions CSV</Button>
          </>
        }
      />
      <div className="mb-5"><RangeTabs value={days} onChange={setDays} /></div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross sales" value={formatINRWhole(k.salesPaise)} hint={`${k.orders} shipments`} />
        <StatCard label="Platform commission" value={formatINRWhole(k.commissionPaise)} hint={`Sellers earn ${formatINRWhole(k.netToSellersPaise)}`} />
        <StatCard label="Average shipment" value={formatINRWhole(k.avgOrderPaise)} hint={`${k.units} units sold`} />
        <StatCard label="New buyers" value={k.newBuyers} hint={`${k.activeSellers} active sellers`} />
      </div>
      <p className="mt-3 text-xs text-muted">Gross sales = commission + seller earnings + delivery charges ({formatINRWhole(k.deliveryPaise)} here), after {formatINRWhole(k.discountPaise)} of coupon discounts.</p>

      <section className="mt-6 rounded-lg border border-line bg-white p-5" aria-labelledby="a-sales">
        <h2 id="a-sales" className="mb-3 text-lg">Daily sales</h2>
        {k.orders === 0 ? <EmptyState title="No sales in this period" /> : (
          <>
            <SalesChart data={data.series} />
            <h3 className="mb-1 mt-4 text-sm text-muted">Shipments per day</h3>
            <OrdersBars data={data.series} />
          </>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="a-sellers">
          <h2 id="a-sellers" className="mb-4 text-lg">Top sellers</h2>
          {data.topSellers.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : (
            <RankedBars label="Top sellers by sales" rows={data.topSellers.map((s) => ({ name: s.name, value: s.salesPaise, hint: `${s.orders} shipments · commission ${formatINRWhole(s.commissionPaise)}` }))} />
          )}
        </section>
        <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="a-cats">
          <h2 id="a-cats" className="mb-4 text-lg">Sales by category</h2>
          {data.categories.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : (
            <RankedBars label="Sales by category" rows={data.categories.map((c) => ({ name: c.name, value: c.salesPaise, hint: `${c.units} units` }))} />
          )}
        </section>
        <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="a-items">
          <h2 id="a-items" className="mb-4 text-lg">Top items</h2>
          {data.topItems.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : (
            <RankedBars label="Top items by sales" rows={data.topItems.map((t) => ({ name: t.name, value: t.salesPaise, hint: `${t.units} units` }))} />
          )}
        </section>
        <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="a-status">
          <h2 id="a-status" className="mb-4 text-lg">Shipments by status</h2>
          {data.statusBreakdown.length === 0 ? <p className="text-sm text-muted">No shipments in this period.</p> : (
            <RankedBars label="Shipments by status" format={(n) => String(n)} rows={data.statusBreakdown.map((s) => ({ name: readable(s.status), value: s.count }))} />
          )}
        </section>
      </div>

      <section className="mt-6" aria-labelledby="a-inv">
        <h2 id="a-inv" className="mb-3 text-lg">Inventory across all sellers</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Units available" value={inv.unitsAvailable} hint={`${inv.unitsReserved} reserved · ${inv.unitsSold} sold`} />
          <StatCard label="Stock value" value={formatINRWhole(inv.valuePaise)} hint="At selling price" />
          <StatCard label="Reorder needed" value={inv.lowStockSkus} accent={inv.lowStockSkus > 0} hint="SKUs at or below reorder level" />
          <StatCard label="Out of stock" value={inv.outOfStockSkus} accent={inv.outOfStockSkus > 0} hint="SKUs with no units" />
        </div>
      </section>
    </div>
  );
}
