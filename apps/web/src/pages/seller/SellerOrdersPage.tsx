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
import { useSellerOrders, type SellerCounts } from '../../features/orders/ordersApi';
import { formatDateTime, formatINR } from '../../utils/format';

const FILTERS: { id: string; label: string; count?: keyof SellerCounts }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'NEW', label: 'New', count: 'NEW' },
  { id: 'TO_SHIP', label: 'To ship', count: 'TO_SHIP' },
  { id: 'SHIPPED', label: 'Shipped', count: 'SHIPPED' },
  { id: 'DELIVERED', label: 'Delivered', count: 'DELIVERED' },
  { id: 'RETURNS', label: 'Returns', count: 'RETURNS' },
  { id: 'CANCELLED', label: 'Cancelled', count: 'CANCELLED' },
];

export function SellerOrdersPage() {
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.find((f) => f.id === params.get('filter'))?.id ?? 'ALL';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const qParam = params.get('q') ?? '';
  const [search, setSearch] = useState(qParam);
  const { data, isLoading, isError, isFetching } = useSellerOrders(filter, qParam, page);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== qParam) setParams((p) => { const n = new URLSearchParams(p); if (search) n.set('q', search); else n.delete('q'); n.delete('page'); return n; });
    }, 300);
    return () => clearTimeout(t);
  }, [search, qParam, setParams]);

  const setFilter = (id: string) => setParams((p) => { const n = new URLSearchParams(p); if (id === 'ALL') n.delete('filter'); else n.set('filter', id); n.delete('page'); return n; });

  return (
    <div>
      <PageHeader title="Orders" subtitle="Orders from buyers, split by seller. Accept, pack and ship each one here." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TextField type="search" size="small" label="Search by order number" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: { xs: '100%', sm: 300 }, bgcolor: 'white' }} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter orders">
          {FILTERS.map((f) => {
            const n = f.count ? data?.counts[f.count] : undefined;
            return <Chip key={f.id} label={n !== undefined && n > 0 ? `${f.label} (${n})` : f.label} clickable color={filter === f.id ? 'primary' : 'default'} variant={filter === f.id ? 'filled' : 'outlined'} onClick={() => setFilter(f.id)} />;
          })}
        </div>
      </div>

      {isError ? <Alert severity="error">Could not load orders.</Alert> : isLoading ? <Skeleton variant="rounded" height={320} /> : data && data.items.length === 0 ? (
        <EmptyState title={qParam || filter !== 'ALL' ? 'No orders match' : 'No orders yet'} message={qParam || filter !== 'ALL' ? 'Try a different filter.' : 'When a buyer purchases your products, the order appears here.'} />
      ) : data && (
        <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Order</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Items</th>
                  <th className="px-5 py-3 font-medium">Payment</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((o) => (
                  <tr key={o.id} className="hover:bg-canvas">
                    <td className="px-5 py-3">
                      <Link to={`/seller/orders/${o.id}`} className="font-mono font-medium text-blue-600 hover:underline">{o.orderNo}</Link>
                      <p className="text-xs text-muted">{formatDateTime(o.placedAt)}</p>
                    </td>
                    <td className="px-5 py-3">{o.customer}<p className="text-xs text-muted">{o.city}</p></td>
                    <td className="px-5 py-3"><span className="line-clamp-1 max-w-[220px]">{o.preview[0]?.name}</span><p className="text-xs text-muted">{o.itemCount} {o.itemCount === 1 ? 'unit' : 'units'}</p></td>
                    <td className="px-5 py-3">{o.payment ? <>{PAYMENT_LABEL[o.payment.method as keyof typeof PAYMENT_LABEL]}<p className="text-xs text-muted">{o.payment.status.charAt(0) + o.payment.status.slice(1).toLowerCase().replace(/_/g, ' ')}</p></> : '—'}</td>
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
