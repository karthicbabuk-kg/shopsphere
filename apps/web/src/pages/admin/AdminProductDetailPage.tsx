import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { ArrowLeft, ImageOff } from 'lucide-react';
import type { ProductAction } from '@shopsphere/shared-validation';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { ReasonDialog } from '../../components/ReasonDialog';
import { useAdminProduct, useProductAction } from '../../features/admin/catalogAdminApi';
import { thumb } from '../../features/catalog/catalogApi';
import { formatDateTime, formatINR } from '../../utils/format';

const LABEL: Record<string, string> = {
  'product.create': 'Created',
  'product.update': 'Edited',
  'product.approve': 'Approved',
  'product.reject': 'Rejected',
  'product.suspend': 'Suspended',
  'product.reinstate': 'Reinstated',
  'product.archive': 'Archived',
};

export function AdminProductDetailPage() {
  const { id = '' } = useParams();
  const { data: p, isLoading, isError } = useAdminProduct(id);
  const act = useProductAction(id);
  const [dialog, setDialog] = useState<'reject' | 'suspend' | null>(null);
  const [active, setActive] = useState(0);

  if (isError) return <Alert severity="error">Product not found.</Alert>;
  if (isLoading || !p) return <Skeleton variant="rounded" height={420} />;

  const run = (action: ProductAction, reason?: string) =>
    act.mutate({ action, reason }, { onSuccess: () => setDialog(null) });
  const sellerHidden = p.seller.status !== 'APPROVED';

  return (
    <>
      <Link to="/admin/products" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600">
        <ArrowLeft size={16} /> All products
      </Link>
      <PageHeader
        title={p.name}
        subtitle={`${p.seller.store?.name ?? p.seller.businessName} · ${p.category.name}${p.brand ? ` · ${p.brand.name}` : ''}`}
        actions={
          <>
            {p.approval === 'PENDING' && (
              <>
                <Button variant="contained" disabled={act.isPending} onClick={() => run('approve')}>
                  Approve
                </Button>
                <Button variant="outlined" color="error" onClick={() => setDialog('reject')}>
                  Reject
                </Button>
              </>
            )}
            {p.approval === 'APPROVED' && (
              <Button variant="outlined" color="error" onClick={() => setDialog('suspend')}>
                Suspend
              </Button>
            )}
            {p.approval === 'SUSPENDED' && (
              <Button variant="contained" disabled={act.isPending} onClick={() => run('reinstate')}>
                Reinstate
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status={p.approval} />
        {p.rejectionReason && <span className="text-sm text-muted">Reason: {p.rejectionReason}</span>}
      </div>
      {sellerHidden && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          The seller's store is {p.seller.status.toLowerCase()}, so this product stays hidden from buyers regardless of its review status.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-lg border border-line bg-white p-4" aria-label="Images">
          <div className="grid aspect-square place-items-center overflow-hidden rounded-md bg-zone">
            {p.images[active] ? (
              <img src={thumb(p.images[active].url, 800)} alt={`${p.name} – image ${active + 1}`} className="h-full w-full object-cover" />
            ) : (
              <ImageOff size={32} className="text-faint" aria-label="No images" />
            )}
          </div>
          {p.images.length > 1 && (
            <ul className="mt-3 grid grid-cols-5 gap-2">
              {p.images.map((img, i) => (
                <li key={img.id}>
                  <button type="button" onClick={() => setActive(i)} aria-label={`Show image ${i + 1}`} className={`block aspect-square w-full overflow-hidden rounded-md border-2 ${i === active ? 'border-blue-600' : 'border-transparent'}`}>
                    <img src={thumb(img.url, 120)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-white p-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-3xl tabular-nums">{formatINR(p.pricePaise)}</span>
              {p.mrpPaise > p.pricePaise && <span className="font-mono text-muted line-through">{formatINR(p.mrpPaise)}</span>}
            </div>
            <p className="mt-4 whitespace-pre-line text-muted">{p.description}</p>
          </section>

          <section className="rounded-lg border border-line bg-white p-6">
            <h2 className="mb-3 text-lg">SKUs</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="font-mono text-xs tracking-wider text-muted uppercase">
                  <tr>
                    <th className="py-2 font-medium">SKU</th>
                    <th className="py-2 font-medium">Variant</th>
                    <th className="py-2 text-right font-medium">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {p.variants.map((v) => (
                    <tr key={v.id}>
                      <td className="py-2 font-mono">{v.sku}</td>
                      <td className="py-2">{v.label}</td>
                      <td className="py-2 text-right font-mono tabular-nums">{v.inventory?.available ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {p.attributes.length > 0 && (
            <section className="rounded-lg border border-line bg-white p-6">
              <h2 className="mb-3 text-lg">Specifications</h2>
              <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
                {p.attributes.map((a) => (
                  <div key={a.id} className="contents">
                    <dt className="text-muted">{a.key}</dt>
                    <dd>{a.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="rounded-lg border border-line bg-white p-6">
            <h2 className="mb-3 text-lg">Review history</h2>
            {p.history.length === 0 ? (
              <p className="text-sm text-muted">No activity recorded yet.</p>
            ) : (
              <ol className="space-y-4 border-l border-line pl-5">
                {p.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-600" aria-hidden="true" />
                    <p className="text-sm font-medium">{LABEL[h.action] ?? h.action}</p>
                    <p className="font-mono text-xs text-muted">
                      {formatDateTime(h.createdAt)}
                      {h.actor ? ` · ${h.actor.name}` : ''}
                    </p>
                    {h.meta?.reason && <p className="mt-1 text-sm text-muted">“{h.meta.reason}”</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <ReasonDialog
        open={dialog === 'reject'}
        title="Reject product"
        description="The seller is notified with this reason and can edit and resubmit."
        confirmLabel="Reject product"
        busy={act.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(r) => run('reject', r)}
      />
      <ReasonDialog
        open={dialog === 'suspend'}
        title="Suspend product"
        description="The product is removed from the storefront until reinstated."
        confirmLabel="Suspend product"
        busy={act.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(r) => run('suspend', r)}
      />
    </>
  );
}
