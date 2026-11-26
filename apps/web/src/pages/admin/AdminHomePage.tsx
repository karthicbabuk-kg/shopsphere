import { Link } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import { Boxes, IndianRupee, Package, Percent, ShoppingBag, Store, UserCheck, Users } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { EmptyState } from '../../components/EmptyState';
import { useOverview } from '../../features/admin/adminApi';
import { formatDate, formatINR } from '../../utils/format';

export function AdminHomePage() {
  const { data, isLoading, isError } = useOverview();

  if (isError) return <Alert severity="error">Could not load platform metrics.</Alert>;
  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={116} />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" subtitle="Live platform metrics from the database." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Buyers" value={data.buyers} icon={<Users size={18} />} />
        <StatCard
          label="Sellers"
          value={data.sellers.total}
          hint={`${data.sellers.active} active`}
          icon={<Store size={18} />}
        />
        <StatCard
          label="Pending sellers"
          value={data.sellers.pending}
          hint={data.sellers.pending ? 'Awaiting your review' : 'All reviewed'}
          icon={<UserCheck size={18} />}
          accent={data.sellers.pending > 0}
        />
        <StatCard
          label="Products"
          value={data.products.total}
          hint={`${data.products.pendingApproval} pending approval`}
          icon={<Package size={18} />}
        />
        <StatCard label="Orders" value={data.orders.total} icon={<ShoppingBag size={18} />} />
        <StatCard
          label="Gross order value"
          value={formatINR(data.orders.grossPaise)}
          icon={<IndianRupee size={18} />}
        />
        <StatCard
          label="Platform commission"
          value={formatINR(data.commissionPaise)}
          icon={<Percent size={18} />}
        />
        <StatCard
          label="Suspended / rejected"
          value={data.sellers.suspended + data.sellers.rejected}
          icon={<Boxes size={18} />}
        />
      </div>

      <section className="mt-10" aria-labelledby="pending-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="pending-heading" className="text-xl">
            Seller applications waiting
          </h2>
          <Link to="/admin/sellers?status=PENDING" className="text-sm font-bold text-blue-600">
            View all
          </Link>
        </div>
        {data.pendingSellers.length === 0 ? (
          <EmptyState title="No pending applications" message="New seller applications will appear here." />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {data.pendingSellers.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/admin/sellers/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 hover:bg-blue-50"
                >
                  <span>
                    <span className="block font-medium">{s.store?.name ?? s.businessName}</span>
                    <span className="block text-sm text-muted">
                      {s.businessName} · {s.user.email}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-muted">Applied {formatDate(s.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
