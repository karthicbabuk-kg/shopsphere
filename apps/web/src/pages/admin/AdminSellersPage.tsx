import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Pagination from '@mui/material/Pagination';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import { SELLER_STATUSES, type SellerStatus } from '@shopsphere/shared-types';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { useSellerList } from '../../features/admin/adminApi';
import { formatDate } from '../../utils/format';

export function AdminSellersPage() {
  const [params, setParams] = useSearchParams();
  const status = SELLER_STATUSES.find((s) => s === params.get('status'));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const qParam = params.get('q') ?? '';
  const [search, setSearch] = useState(qParam);

  // Debounce typing into the URL so every keystroke does not hit the API.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search === qParam) return;
      setParams((p) => {
        const n = new URLSearchParams(p);
        if (search) n.set('q', search);
        else n.delete('q');
        n.delete('page');
        return n;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [search, qParam, setParams]);

  const { data, isLoading, isError, isFetching } = useSellerList({ status, q: qParam || undefined, page });
  const counts = data?.statusCounts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  const setStatus = (s: SellerStatus | '') =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (s) n.set('status', s);
      else n.delete('status');
      n.delete('page');
      return n;
    });

  return (
    <>
      <PageHeader title="Sellers" subtitle="Review applications and manage store access." />

      <Tabs
        value={status ?? ''}
        onChange={(_, v: SellerStatus | '') => setStatus(v)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Filter sellers by status"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        <Tab value="" label={`All (${all})`} />
        {SELLER_STATUSES.map((s) => (
          <Tab key={s} value={s} label={`${s.charAt(0)}${s.slice(1).toLowerCase()} (${counts[s] ?? 0})`} />
        ))}
      </Tabs>

      <TextField
        type="search"
        size="small"
        label="Search by store, business or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, width: { xs: '100%', sm: 360 }, bgcolor: 'white' }}
      />

      {isError ? (
        <Alert severity="error">Could not load sellers.</Alert>
      ) : isLoading ? (
        <Skeleton variant="rounded" height={320} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title="No sellers match"
          message="Try a different status or search term."
        />
      ) : (
        <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Store</th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Products</th>
                  <th className="px-5 py-3 font-medium">Applied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data?.items.map((s) => (
                  <tr key={s.id} className="h-14 hover:bg-blue-50">
                    <td className="px-5">
                      <Link to={`/admin/sellers/${s.id}`} className="font-medium text-blue-600 hover:underline">
                        {s.store?.name ?? s.businessName}
                      </Link>
                      <div className="text-xs text-muted">{s.businessName}</div>
                    </td>
                    <td className="px-5">
                      <div>{s.user.name}</div>
                      <div className="text-xs text-muted">{s.user.email}</div>
                    </td>
                    <td className="px-5">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-5 text-right font-mono tabular-nums">{s._count.products}</td>
                    <td className="px-5 font-mono text-xs text-muted">{formatDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && data.meta.totalPages > 1 && (
            <div className="mt-4 flex justify-end">
              <Pagination
                count={data.meta.totalPages}
                page={page}
                color="primary"
                onChange={(_, p) =>
                  setParams((prev) => {
                    const n = new URLSearchParams(prev);
                    n.set('page', String(p));
                    return n;
                  })
                }
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
