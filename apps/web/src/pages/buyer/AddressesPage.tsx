import { useState } from 'react';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { AccountTabs } from '../../features/orders/AccountTabs';
import { AddressDialog } from '../../features/orders/AddressDialog';
import { AddressBlock } from '../../features/orders/orderUi';
import { useAddressMutations, useAddresses, type Address } from '../../features/orders/ordersApi';
import { toast } from '../../store/toast';

export function AddressesPage() {
  const { data, isLoading } = useAddresses();
  const { remove, makeDefault } = useAddressMutations();
  const [editing, setEditing] = useState<Address | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Address | null>(null);

  const openNew = () => { setEditing(null); setOpen(true); };

  return (
    <section className="mx-auto max-w-[920px] px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl">My account</h1>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={openNew}>Add address</Button>
      </div>
      <div className="mt-6"><AccountTabs /></div>

      {isLoading ? <Skeleton variant="rounded" height={160} /> : !data || data.length === 0 ? (
        <EmptyState title="No saved addresses" message="Add an address to check out faster." action={<Button variant="contained" onClick={openNew}>Add address</Button>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.map((a) => (
            <li key={a.id} className="rounded-xl border border-line bg-white p-5">
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
                {a.label}
                {a.isDefault && <span className="rounded bg-blue-50 px-1.5 py-0.5 normal-case tracking-normal text-blue-700">Default</span>}
              </p>
              <AddressBlock a={a} />
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm font-medium">
                <button type="button" className="inline-flex items-center gap-1.5 text-blue-600 hover:underline" onClick={() => { setEditing(a); setOpen(true); }}>
                  <Pencil size={14} aria-hidden="true" /> Edit<span className="sr-only"> {a.label} address</span>
                </button>
                <button type="button" className="inline-flex items-center gap-1.5 text-muted hover:text-danger" onClick={() => setDeleting(a)}>
                  <Trash2 size={14} aria-hidden="true" /> Delete<span className="sr-only"> {a.label} address</span>
                </button>
                {!a.isDefault && <button type="button" className="text-muted hover:text-ink" disabled={makeDefault.isPending} onClick={() => makeDefault.mutate(a.id)}>Make default</button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddressDialog open={open} address={editing} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete this address?"
        message="Past orders keep their delivery details. This only removes it from your address book."
        confirmLabel="Delete"
        busy={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { toast.success('Address deleted'); setDeleting(null); } })}
      />
    </section>
  );
}
