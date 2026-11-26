import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Pagination from '@mui/material/Pagination';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { ImageOff, Plus, TriangleAlert } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { thumb, useSellerProducts } from '../../features/catalog/catalogApi';
import { formatINR } from '../../utils/format';

const STATUS_FILTERS = [
  { value: '', label: 'All products' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'ACTIVE', label: 'Submitted' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function SellerProductsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
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

  const { data, isLoading, isError, isFetching } = useSellerProducts({
    q: qParam || undefined,
    status: status || undefined,
    page,
  });

  const newButton = (
    <Button component={Link} to="/seller/products/new" variant="contained" startIcon={<Plus size={18} />}>
      New product
    </Button>
  );

  return (
    <>
      <PageHeader title="Products" subtitle="Create listings, manage variants and track review status." actions={newButton} />

      <div className="mb-4 flex flex-wrap gap-3">
        <TextField
          type="search"
          size="small"
          label="Search by name or SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 320 }, bgcolor: 'white' }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) =>
            setParams((p) => {
              const n = new URLSearchParams(p);
              if (e.target.value) n.set('status', e.target.value);
              else n.delete('status');
              n.delete('page');
              return n;
            })
          }
          sx={{ minWidth: 180, bgcolor: 'white' }}
        >
          {STATUS_FILTERS.map((f) => (
            <MenuItem key={f.value} value={f.value}>
              {f.label}
            </MenuItem>
          ))}
        </TextField>
      </div>

      {isError ? (
        <Alert severity="error">Could not load your products.</Alert>
      ) : isLoading ? (
        <Skeleton variant="rounded" height={320} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title={qParam || status ? 'No products match' : 'No products yet'}
          message={qParam || status ? 'Try a different search or filter.' : 'Create your first product to start selling.'}
          action={!qParam && !status ? newButton : undefined}
        />
      ) : (
        <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 text-right font-medium">Price</th>
                  <th className="px-5 py-3 text-right font-medium">Stock</th>
                  <th className="px-5 py-3 font-medium">State</th>
                  <th className="px-5 py-3 font-medium">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data?.items.map((p) => (
                  <tr key={p.id} className="hover:bg-blue-50">
                    <td className="px-5 py-3">
                      <Link to={`/seller/products/${p.id}`} className="flex items-center gap-3">
                        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-zone">
                          {p.image ? (
                            <img src={thumb(p.image, 96)} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <ImageOff size={18} className="text-faint" aria-label="No image" />
                          )}
                        </span>
                        <span>
                          <span className="block max-w-[280px] truncate font-medium text-blue-600">{p.name}</span>
                          <span className="block font-mono text-xs text-muted">
                            {p.skus[0]}
                            {p.skuCount > 1 ? ` +${p.skuCount - 1} more` : ''}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 text-muted">{p.category.name}</td>
                    <td className="px-5 text-right font-mono tabular-nums">{formatINR(p.pricePaise)}</td>
                    <td className="px-5 text-right font-mono tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {p.lowStock && <TriangleAlert size={14} className="text-warning" aria-label="Low stock" />}
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-5">
                      <StatusBadge status={p.status} tone={p.status === 'ACTIVE' ? 'info' : 'neutral'} />
                    </td>
                    <td className="px-5">{p.status === 'DRAFT' ? <span className="text-faint">—</span> : <StatusBadge status={p.approval} />}</td>
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
