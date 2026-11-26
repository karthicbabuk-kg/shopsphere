import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { useAdminSettlements, useSettlementActions, type PendingSettlement, type Settlement } from '../../features/reports/reportsApi';
import { formatDate, formatINR } from '../../utils/format';

export function AdminSettlementsPage() {
  const { data, isLoading, isError } = useAdminSettlements();
  const { create, pay } = useSettlementActions();
  const [settle, setSettle] = useState<PendingSettlement | null>(null);
  const [paying, setPaying] = useState<Settlement | null>(null);

  if (isError) return <Alert severity="error">Could not load settlements.</Alert>;
  if (isLoading || !data) return <><PageHeader title="Settlements" /><Skeleton variant="rounded" height={320} /></>;

  return (
    <div>
      <PageHeader title="Settlements" subtitle="Pay sellers their earnings for delivered orders, net of the platform commission. Demo only: marking a settlement paid moves no real money." />

      <section aria-labelledby="ready-h">
        <h2 id="ready-h" className="mb-3 text-lg">Ready to settle</h2>
        {data.pending.length === 0 ? <EmptyState title="Nothing to settle" message="Delivered orders that have not been settled appear here." /> : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
                <tr><th className="px-5 py-3 font-medium">Seller</th><th className="px-5 py-3 text-right font-medium">Orders</th><th className="px-5 py-3 text-right font-medium">Gross</th><th className="px-5 py-3 text-right font-medium">Commission</th><th className="px-5 py-3 text-right font-medium">Net payout</th><th className="px-5 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.pending.map((p) => (
                  <tr key={p.sellerId}>
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{p.shipments}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatINR(p.grossPaise)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatINR(p.commissionPaise)}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">{formatINR(p.netPaise)}</td>
                    <td className="px-5 py-3 text-right"><Button size="small" variant="contained" onClick={() => setSettle(p)} aria-label={`Create settlement for ${p.name}`}>Create settlement</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="hist-h">
        <h2 id="hist-h" className="mb-3 text-lg">Settlement history</h2>
        {data.items.length === 0 ? <EmptyState title="No settlements yet" /> : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
                <tr><th className="px-5 py-3 font-medium">Created</th><th className="px-5 py-3 font-medium">Seller</th><th className="px-5 py-3 text-right font-medium">Orders</th><th className="px-5 py-3 text-right font-medium">Net payout</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3">{formatDate(s.createdAt)}</td>
                    <td className="px-5 py-3">{s.sellerName}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.shipments}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">{formatINR(s.netPaise)}</td>
                    <td className="px-5 py-3"><StatusBadge status={s.status} tone={s.status === 'PAID' ? 'success' : 'warning'} /></td>
                    <td className="px-5 py-3 text-right">{s.status === 'PENDING' && <Button size="small" variant="outlined" onClick={() => setPaying(s)} aria-label={`Mark settlement for ${s.sellerName} as paid`}>Mark paid</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!settle}
        title="Create this settlement?"
        message={settle ? `${settle.shipments} delivered ${settle.shipments === 1 ? 'order' : 'orders'} from ${settle.name} will be settled: ${formatINR(settle.netPaise)} payout after ${formatINR(settle.commissionPaise)} commission.` : ''}
        confirmLabel="Create settlement"
        busy={create.isPending}
        onClose={() => setSettle(null)}
        onConfirm={() => settle && create.mutate(settle.sellerId, { onSettled: () => setSettle(null) })}
      />
      <ConfirmDialog
        open={!!paying}
        title="Mark as paid?"
        message={paying ? `Record the ${formatINR(paying.netPaise)} payout to ${paying.sellerName} as paid. This is a demo and transfers no real money.` : ''}
        confirmLabel="Mark paid"
        busy={pay.isPending}
        onClose={() => setPaying(null)}
        onConfirm={() => paying && pay.mutate(paying.id, { onSettled: () => setPaying(null) })}
      />
    </div>
  );
}
