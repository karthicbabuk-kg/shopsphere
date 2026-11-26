import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import Pagination from '@mui/material/Pagination';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import { ImageOff } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { AccountTabs } from '../../features/orders/AccountTabs';
import { OrderStatusBadge } from '../../features/orders/orderUi';
import { useOrders } from '../../features/orders/ordersApi';
import { cdn } from '../../utils/cdn';
import { formatDate, formatINR } from '../../utils/format';

const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'ACTIVE', label: 'In progress' },
  { id: 'DELIVERED', label: 'Delivered' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: 'RETURNS', label: 'Returns' },
];

export function OrdersPage() {
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useOrders(filter, page);

  return (
    <section className="mx-auto max-w-[920px] px-5 py-10">
      <h1 className="text-4xl">My account</h1>
      <div className="mt-6"><AccountTabs /></div>

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter orders">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => { setFilter(f.id); setPage(1); }}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${filter === f.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-line bg-white text-ink hover:border-faint'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isError ? <Alert severity="error">We could not load your orders. Please refresh.</Alert> : isLoading ? (
        <div className="space-y-3"><Skeleton variant="rounded" height={110} /><Skeleton variant="rounded" height={110} /></div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={filter === 'ALL' ? 'No orders yet' : 'No orders in this view'}
          message={filter === 'ALL' ? 'When you place an order it will show up here with live tracking.' : 'Try another filter.'}
          action={filter === 'ALL' ? <Button component={Link} to="/" variant="contained">Start shopping</Button> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((o) => (
            <li key={o.id}>
              <Link to={`/account/orders/${o.id}`} className="block rounded-xl border border-line bg-white p-4 hover:border-blue-600 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-medium">{o.orderNo}</p>
                    <p className="text-xs text-muted">Placed {formatDate(o.placedAt)} · {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'}{o.shipmentCount > 1 ? ` · ${o.shipmentCount} shipments` : ''}</p>
                  </div>
                  <div className="text-right">
                    <OrderStatusBadge status={o.status} />
                    <p className="mt-1 text-base font-bold tabular-nums">{formatINR(o.totalPaise)}</p>
                  </div>
                </div>
                <ul className="mt-3 flex gap-2" aria-label="Items in this order">
                  {o.preview.map((p, i) => (
                    <li key={i} className="h-14 w-14 overflow-hidden rounded-lg border border-line bg-zone" title={p.name}>
                      {p.image ? <img src={cdn(p.image, 112)} alt={p.name} width={56} height={56} loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center"><ImageOff size={16} className="text-faint" /></span>}
                    </li>
                  ))}
                </ul>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && data.meta.totalPages > 1 && <div className="mt-6 flex justify-center"><Pagination count={data.meta.totalPages} page={page} color="primary" onChange={(_, p) => setPage(p)} /></div>}
    </section>
  );
}
