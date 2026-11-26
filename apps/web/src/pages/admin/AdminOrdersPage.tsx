import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Pagination from '@mui/material/Pagination';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { OrderStatusBadge, PAYMENT_LABEL } from '../../features/orders/orderUi';
import { readable } from '../../features/reports/RangeTabs';
import { useAdminOrders } from '../../features/reports/reportsApi';
import { formatDateTime, formatINR } from '../../utils/format';

const STATUSES = ['PLACED', 'CONFIRMED', 'PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];

export function AdminOrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = STATUSES.find((s) => s === params.get('status'));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const qParam = params.get('q') ?? '';
  const [search, setSearch] = useState(qParam);
  const { data, isLoading, isError, isFetching } = useAdminOrders({ status, q: qParam || undefined, page });

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== qParam) setParams((p) => { const n = new URLSearchParams(p); if (search) n.set('q', search); else n.delete('q'); n.delete('page'); return n; });
    }, 300);
    return () => clearTimeout(t);
  }, [search, qParam, setParams]);

  const setStatus = (s: string) => setParams((p) => { const n = new URLSearchParams(p); if (s) n.set('status', s); else n.delete('status'); n.delete('page'); return n; });

  return (
    <div>
      <PageHeader title="Orders" subtitle="Every order on the platform. This view is read-only: sellers fulfil, buyers cancel and return." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TextField type="search" size="small" label="Search by order number" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: { xs: '100%', sm: 300 }, bgcolor: 'white' }} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {[{ v: '', l: 'All' }, ...STATUSES.map((s) => ({ v: s, l: readable(s) }))].map((f) => {
            const n = f.v ? data?.statusCounts[f.v] : undefined;
            return <Chip key={f.v} label={n ? `${f.l} (${n})` : f.l} clickable color={(status ?? '') === f.v ? 'primary' : 'default'} variant={(status ?? '') === f.v ? 'filled' : 'outlined'} onClick={() => setStatus(f.v)} />;
          })}
        </div>
      </div>

      {isError ? <Alert severity="error">Could not load orders.</Alert> : isLoading ? <Skeleton variant="rounded" height={320} /> : data && data.items.length === 0 ? (
        <EmptyState title="No orders match" message="Try a different status or order number." />
      ) : data && (
        <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
                <tr><th className="px-5 py-3 font-medium">Order</th><th className="px-5 py-3 font-medium">Buyer</th><th className="px-5 py-3 font-medium">Shipments</th><th className="px-5 py-3 font-medium">Payment</th><th className="px-5 py-3 text-right font-medium">Total</th><th className="px-5 py-3 font-medium">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((o) => (
                  <tr key={o.id} className="hover:bg-canvas">
                    <td className="px-5 py-3"><Link to={`/admin/orders/${o.id}`} className="font-mono font-medium text-blue-600 hover:underline">{o.orderNo}</Link><p className="text-xs text-muted">{formatDateTime(o.placedAt)}</p></td>
                    <td className="px-5 py-3">{o.buyer}</td>
                    <td className="px-5 py-3 tabular-nums">{o.shipments}</td>
                    <td className="px-5 py-3">{o.payment ? <>{PAYMENT_LABEL[o.payment.method as keyof typeof PAYMENT_LABEL]}<p className="text-xs text-muted">{readable(o.payment.status)}</p></> : '—'}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">{formatINR(o.totalPaise)}</td>
                    <td className="px-5 py-3"><OrderStatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.meta.totalPages > 1 && <div className="mt-4 flex justify-end"><Pagination count={data.meta.totalPages} page={page} color="primary" onChange={(_, p) => setParams((s) => { const n = new URLSearchParams(s); n.set('page', String(p)); return n; })} /></div>}
        </div>
      )}
    </div>
  );
}
