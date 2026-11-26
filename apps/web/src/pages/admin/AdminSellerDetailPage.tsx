import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { ArrowLeft } from 'lucide-react';
import type { SellerAction } from '@shopsphere/shared-validation';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { StatCard } from '../../components/StatCard';
import { EmptyState } from '../../components/EmptyState';
import { ReasonDialog } from '../../components/ReasonDialog';
import { useSellerAction, useSellerDetail } from '../../features/admin/adminApi';
import { formatDate, formatDateTime } from '../../utils/format';

const ACTION_LABEL: Record<string, string> = {
  'seller.approve': 'Approved',
  'seller.reject': 'Rejected',
  'seller.suspend': 'Suspended',
  'seller.reactivate': 'Reactivated',
  'seller.register': 'Applied',
  'seller.profile_updated': 'Profile updated',
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="font-mono text-xs tracking-wider text-muted uppercase">{label}</dt>
      <dd className="mt-0.5">{value || '—'}</dd>
    </div>
  );
}

export function AdminSellerDetailPage() {
  const { id = '' } = useParams();
  const { data: s, isLoading, isError } = useSellerDetail(id);
  const act = useSellerAction(id);
  const [dialog, setDialog] = useState<'reject' | 'suspend' | null>(null);

  if (isError) return <Alert severity="error">Seller not found.</Alert>;
  if (isLoading || !s) return <Skeleton variant="rounded" height={360} />;

  const run = (action: SellerAction, reason?: string) =>
    act.mutate({ action, reason }, { onSuccess: () => setDialog(null) });

  return (
    <>
      <Link to="/admin/sellers" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600">
        <ArrowLeft size={16} /> All sellers
      </Link>
      <PageHeader
        title={s.store?.name ?? s.businessName}
        subtitle={s.businessName}
        actions={
          <>
            {(s.status === 'PENDING' || s.status === 'REJECTED') && (
              <Button variant="contained" disabled={act.isPending} onClick={() => run('approve')}>
                Approve
              </Button>
            )}
            {s.status === 'PENDING' && (
              <Button variant="outlined" color="error" onClick={() => setDialog('reject')}>
                Reject
              </Button>
            )}
            {s.status === 'APPROVED' && (
              <Button variant="outlined" color="error" onClick={() => setDialog('suspend')}>
                Suspend
              </Button>
            )}
            {s.status === 'SUSPENDED' && (
              <Button variant="contained" disabled={act.isPending} onClick={() => run('reactivate')}>
                Reactivate
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status={s.status} />
        {s.rejectionReason && (s.status === 'REJECTED' || s.status === 'SUSPENDED') && (
          <span className="text-sm text-muted">Reason: {s.rejectionReason}</span>
        )}
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Products" value={s._count.products} />
        <StatCard label="Orders" value={s._count.orders} />
        <StatCard label="Applied" value={formatDate(s.createdAt)} />
        <StatCard label="Approved" value={s.approvedAt ? formatDate(s.approvedAt) : '—'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-white p-6" aria-labelledby="owner">
          <h2 id="owner" className="mb-4 text-lg">
            Owner and business
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={s.user.name} />
            <Field label="Email" value={s.user.email} />
            <Field label="Mobile" value={s.user.phone} />
            <Field label="GSTIN" value={s.gstin} />
            <Field label="PAN" value={s.pan} />
            <Field label="Joined" value={formatDate(s.user.createdAt)} />
          </dl>
        </section>

        <section className="rounded-lg border border-line bg-white p-6" aria-labelledby="store">
          <h2 id="store" className="mb-4 text-lg">
            Store
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Store name" value={s.store?.name} />
            <Field label="Slug" value={s.store?.slug} />
            <Field label="Contact email" value={s.store?.contactEmail} />
            <Field label="Contact phone" value={s.store?.contactPhone} />
            <Field
              label="Location"
              value={[s.store?.city, s.store?.state].filter(Boolean).join(', ')}
            />
          </dl>
          <p className="mt-4 text-sm text-muted">{s.store?.description || 'No description provided.'}</p>
        </section>

        <section className="rounded-lg border border-line bg-white p-6" aria-labelledby="docs">
          <h2 id="docs" className="mb-4 text-lg">
            Documents
          </h2>
          {s.documents.length === 0 ? (
            <EmptyState title="No documents uploaded" message="The seller has not uploaded verification documents yet." />
          ) : (
            <ul className="divide-y divide-line">
              {s.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-3">
                  <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-blue-600">
                    {d.type}
                  </a>
                  <StatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-line bg-white p-6" aria-labelledby="history">
          <h2 id="history" className="mb-4 text-lg">
            Activity
          </h2>
          {s.history.length === 0 ? (
            <p className="text-sm text-muted">No activity recorded yet.</p>
          ) : (
            <ol className="space-y-4 border-l border-line pl-5">
              {s.history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-600" aria-hidden="true" />
                  <p className="text-sm font-medium">{ACTION_LABEL[h.action] ?? h.action}</p>
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

      <ReasonDialog
        open={dialog === 'reject'}
        title="Reject application"
        description="The seller will be notified with this reason and can see it on their dashboard."
        confirmLabel="Reject application"
        busy={act.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => run('reject', reason)}
      />
      <ReasonDialog
        open={dialog === 'suspend'}
        title="Suspend store"
        description="Their products stop being visible to buyers until the store is reactivated."
        confirmLabel="Suspend store"
        busy={act.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => run('suspend', reason)}
      />
    </>
  );
}
