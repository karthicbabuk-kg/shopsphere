import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Pagination from '@mui/material/Pagination';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import { ImageOff } from 'lucide-react';
import { APPROVAL_STATUSES } from '@shopsphere/shared-types';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { useAdminProducts } from '../../features/admin/catalogAdminApi';
import { thumb } from '../../features/catalog/catalogApi';
import { formatDate, formatINR } from '../../utils/format';

export function AdminProductsPage() {
  const [params, setParams] = useSearchParams();
  const approval = APPROVAL_STATUSES.find((s) => s === params.get('approval')) ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const qParam = params.get('q') ?? '';
  const [search, setSearch] = useState(qParam);

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

  const { data, isLoading, isError, isFetching } = useAdminProducts({
    approval: approval || undefined,
    q: qParam || undefined,
    page,
  });
  const counts = data?.approvalCounts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <>
      <PageHeader title="Products" subtitle="Review submitted listings before they go live." />
      <Tabs
        value={approval}
        onChange={(_, v: string) =>
          setParams((p) => {
            const n = new URLSearchParams(p);
            if (v) n.set('approval', v);
            else n.delete('approval');
            n.delete('page');
            return n;
          })
        }
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Filter products by review status"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        <Tab value="" label={`All (${all})`} />
        {APPROVAL_STATUSES.map((s) => (
          <Tab key={s} value={s} label={`${s.charAt(0)}${s.slice(1).toLowerCase()} (${counts[s] ?? 0})`} />
        ))}
      </Tabs>

      <TextField
        type="search"
        size="small"
        label="Search by product, SKU or store"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, width: { xs: '100%', sm: 360 }, bgcolor: 'white' }}
      />

      {isError ? (
        <Alert severity="error">Could not load products.</Alert>
      ) : isLoading ? (
        <Skeleton variant="rounded" height={320} />
      ) : data && data.items.length === 0 ? (
        <EmptyState title="Nothing to review" message="Products submitted by sellers appear here." />
      ) : (
        <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-5 py-3 font-medium">Store</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 text-right font-medium">Price</th>
                  <th className="px-5 py-3 font-medium">Review</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data?.items.map((p) => (
                  <tr key={p.id} className="hover:bg-blue-50">
                    <td className="px-5 py-3">
                      <Link to={`/admin/products/${p.id}`} className="flex items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-zone">
                          {p.image ? <img src={thumb(p.image, 88)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageOff size={16} className="text-faint" aria-label="No image" />}
                        </span>
                        <span className="max-w-[260px] truncate font-medium text-blue-600">{p.name}</span>
                      </Link>
                    </td>
                    <td className="px-5 text-muted">{p.seller.store?.name ?? '—'}</td>
                    <td className="px-5 text-muted">{p.category.name}</td>
                    <td className="px-5 text-right font-mono tabular-nums">{formatINR(p.pricePaise)}</td>
                    <td className="px-5">
                      <StatusBadge status={p.approval} />
                    </td>
                    <td className="px-5 font-mono text-xs text-muted">{formatDate(p.updatedAt)}</td>
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
