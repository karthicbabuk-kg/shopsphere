import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { FormField } from '../../components/FormField';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import {
  useAdminBrands,
  useAdminCategories,
  useTaxonomyMutation,
  type AdminBrand,
  type AdminCategory,
} from '../../features/admin/catalogAdminApi';
import { toast } from '../../store/toast';

const formSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(60),
  parentId: z.string(),
  active: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

interface Editing {
  kind: 'categories' | 'brands';
  item?: AdminCategory | AdminBrand;
}

function EditDialog({
  editing,
  parents,
  onClose,
}: {
  editing: Editing | null;
  parents: AdminCategory[];
  onClose: () => void;
}) {
  const kind = editing?.kind ?? 'categories';
  const { save } = useTaxonomyMutation(kind);
  const item = editing?.item;
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      name: item?.name ?? '',
      parentId: (item as AdminCategory | undefined)?.parentId ?? '',
      active: item?.active ?? true,
    },
  });

  const onSubmit = handleSubmit((v) => {
    const input =
      kind === 'categories'
        ? { name: v.name, parentId: v.parentId || null, active: v.active, sortOrder: (item as AdminCategory | undefined)?.sortOrder ?? 0 }
        : { name: v.name, active: v.active };
    save.mutate({ id: item?.id, input }, { onSuccess: onClose, onError: (e) => toast.error(e.message) });
  });

  return (
    <Dialog open={!!editing} onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="xs">
      <form onSubmit={onSubmit} noValidate>
        <DialogTitle>
          {item ? 'Edit' : 'Add'} {kind === 'categories' ? 'category' : 'brand'}
        </DialogTitle>
        <DialogContent>
          <div className="mt-1 flex flex-col gap-4">
            <FormField autoFocus label="Name" error={errors.name} {...register('name')} />
            {kind === 'categories' && (
              <FormField
                select
                label="Parent category"
                hint="Leave empty for a top-level category"
                value={watch('parentId')}
                onChange={(e) => setValue('parentId', e.target.value)}
              >
                <MenuItem value="">None (top level)</MenuItem>
                {parents
                  .filter((p) => !p.parentId && p.id !== item?.id)
                  .map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}
                    </MenuItem>
                  ))}
              </FormField>
            )}
            <FormControlLabel
              control={<Switch checked={watch('active')} onChange={(e) => setValue('active', e.target.checked)} />}
              label="Active (visible to sellers and buyers)"
            />
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export function AdminCatalogPage() {
  const [tab, setTab] = useState<'categories' | 'brands'>('categories');
  const cats = useAdminCategories();
  const brands = useAdminBrands();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<{ kind: Editing['kind']; id: string; name: string } | null>(null);
  const delCat = useTaxonomyMutation('categories').remove;
  const delBrand = useTaxonomyMutation('brands').remove;
  const del = deleting?.kind === 'brands' ? delBrand : delCat;

  const query = tab === 'categories' ? cats : brands;
  const nameOf = (id: string | null) => cats.data?.find((c) => c.id === id)?.name;

  // Show children directly under their parent.
  const orderedCats = (cats.data ?? [])
    .filter((c) => !c.parentId)
    .flatMap((c) => [c, ...(cats.data ?? []).filter((x) => x.parentId === c.id)]);

  const rows: { id: string; name: string; indent: boolean; sub: string; active: boolean; products: number; item: AdminCategory | AdminBrand }[] =
    tab === 'categories'
      ? orderedCats.map((c) => ({ id: c.id, name: c.name, indent: !!c.parentId, sub: c.parentId ? `in ${nameOf(c.parentId)}` : `${c._count.children} sub-categories`, active: c.active, products: c._count.products, item: c }))
      : (brands.data ?? []).map((b) => ({ id: b.id, name: b.name, indent: false, sub: '', active: b.active, products: b._count.products, item: b }));

  return (
    <>
      <PageHeader
        title="Catalogue"
        subtitle="Categories and brands that sellers choose from."
        actions={
          <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setEditing({ kind: tab })}>
            Add {tab === 'categories' ? 'category' : 'brand'}
          </Button>
        }
      />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }} aria-label="Catalogue sections">
        <Tab value="categories" label={`Categories${cats.data ? ` (${cats.data.length})` : ''}`} />
        <Tab value="brands" label={`Brands${brands.data ? ` (${brands.data.length})` : ''}`} />
      </Tabs>

      {query.isError ? (
        <Alert severity="error">Could not load the catalogue.</Alert>
      ) : query.isLoading ? (
        <Skeleton variant="rounded" height={320} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing here yet" message="Add the first entry to get started." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Products</th>
                <th className="px-5 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="h-14 hover:bg-blue-50">
                  <td className={`px-5 ${r.indent ? 'pl-12' : ''}`}>
                    <span className={r.indent ? '' : 'font-medium'}>{r.name}</span>
                    {r.sub && <span className="ml-2 text-xs text-muted">{r.sub}</span>}
                  </td>
                  <td className="px-5">
                    <StatusBadge status={r.active ? 'ACTIVE' : 'DRAFT'} tone={r.active ? 'success' : 'neutral'} />
                  </td>
                  <td className="px-5 text-right font-mono tabular-nums">{r.products}</td>
                  <td className="px-5 text-right whitespace-nowrap">
                    <IconButton aria-label={`Edit ${r.name}`} onClick={() => setEditing({ kind: tab, item: r.item })}>
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton aria-label={`Delete ${r.name}`} color="error" onClick={() => setDeleting({ kind: tab, id: r.id, name: r.name })}>
                      <Trash2 size={16} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditDialog editing={editing} parents={cats.data ?? []} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        danger
        busy={del.isPending}
        title={`Delete “${deleting?.name}”?`}
        message="Entries that are in use cannot be deleted; deactivate them instead."
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSettled: () => setDeleting(null) })}
      />
    </>
  );
}
