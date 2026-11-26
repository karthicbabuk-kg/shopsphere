import { Link } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import { Check, Circle } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { StatCard } from '../../components/StatCard';
import { useInventorySummary } from '../../features/inventory/inventoryApi';
import { useSellerProfile } from '../../features/seller/sellerApi';

const BANNER = {
  PENDING: {
    severity: 'info',
    text: 'Your application is under review. You can publish products once an administrator approves it.',
  },
  APPROVED: { severity: 'success', text: 'Your store is approved. You can now publish products.' },
  REJECTED: { severity: 'error', text: 'Your application was not approved.' },
  SUSPENDED: {
    severity: 'warning',
    text: 'Your store is suspended and your products are hidden. Contact the platform administrator.',
  },
} as const;

function InventoryWidget() {
  const { data: s } = useInventorySummary();
  if (!s || s.skuCount === 0) return null;
  const attention = s.outOfStockCount + s.lowStockCount + s.openDiscrepancies;
  return (
    <section className="rounded-lg border border-line bg-white p-6" aria-labelledby="inv-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="inv-heading" className="text-lg">
          Inventory
        </h2>
        <Link to="/seller/inventory" className="text-sm font-bold text-blue-600">
          Manage stock
        </Link>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <StatCard label="SKUs" value={s.skuCount} />
        <StatCard label="Units available" value={s.unitsAvailable} />
        <StatCard label="Reorder needed" value={s.lowStockCount} accent={s.lowStockCount > 0} />
        <StatCard label="Out of stock" value={s.outOfStockCount} accent={s.outOfStockCount > 0} />
      </div>
      {attention === 0 && <p className="mt-4 text-sm text-muted">All stock levels are healthy.</p>}
      {s.alerts.reorderRequired.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-md border border-line text-sm">
          {s.alerts.reorderRequired.slice(0, 3).map((a) => (
            <li key={a.inventoryId} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="truncate">{a.productName}</span>
              <span className="font-mono text-warning">
                {a.available} left · reorder at {a.reorderLevel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SellerHomePage() {
  const { data, isLoading, isError } = useSellerProfile();

  if (isError) return <Alert severity="error">Could not load your seller profile.</Alert>;
  if (isLoading || !data) return <Skeleton variant="rounded" height={260} />;

  const banner = BANNER[data.status];
  const store = data.store;
  const steps = [
    { done: true, label: 'Submit your application', hint: 'Received' },
    {
      done: !!store?.description && !!store.city,
      label: 'Complete your store profile',
      hint: 'Add a description and your location',
      to: '/seller/store',
    },
    {
      done: data.status === 'APPROVED' || data.status === 'SUSPENDED',
      label: 'Get approved by an administrator',
      hint: data.status === 'REJECTED' ? 'Not approved' : 'Usually reviewed within one business day',
    },
  ];

  return (
    <>
      <PageHeader title={store?.name ?? data.businessName} subtitle={data.businessName} />

      <Alert severity={banner.severity} sx={{ mb: 4 }}>
        <div className="flex items-center gap-2">
          <StatusBadge status={data.status} />
        </div>
        <div className="mt-1">
          {banner.text}
          {data.status === 'REJECTED' && data.rejectionReason ? ` Reason: ${data.rejectionReason}` : ''}
        </div>
      </Alert>

      <InventoryWidget />

      <section className="mt-6 rounded-lg border border-line bg-white p-6" aria-labelledby="onboarding">
        <h2 id="onboarding" className="mb-4 text-lg">
          Getting started
        </h2>
        <ol className="space-y-4">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  s.done ? 'bg-success text-white' : 'border border-line text-faint'
                }`}
              >
                {s.done ? <Check size={14} aria-label="Done" /> : <Circle size={8} aria-label="To do" />}
              </span>
              <span>
                <span className="block font-medium">
                  {s.to && !s.done ? (
                    <Link to={s.to} className="text-blue-600">
                      {s.label}
                    </Link>
                  ) : (
                    s.label
                  )}
                </span>
                <span className="block text-sm text-muted">{s.hint}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
