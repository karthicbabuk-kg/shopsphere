import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import {
  inventorySettingsSchema,
  stockAdjustSchema,
  stockCountSchema,
  stockInSchema,
  stockOutSchema,
  warehouseSchema,
} from '@shopsphere/shared-validation';
import { FormField } from '../../components/FormField';
import {
  useCreateWarehouse,
  useRecordCount,
  useStockOperation,
  useUpdateInventorySettings,
  useWarehouses,
  type InventoryRow,
} from './inventoryApi';

export type DialogMode = 'in' | 'out' | 'adjust' | 'count' | 'settings';

const TITLES: Record<DialogMode, string> = {
  in: 'Stock in',
  out: 'Stock out',
  adjust: 'Manual adjustment',
  count: 'Record physical count',
  settings: 'Stock settings',
};

const numberField = { valueAsNumber: true } as const;
const optionalText = { setValueAs: (v: string) => (v === '' ? undefined : v) } as const;

function Preview({ label, from, to }: { label: string; from: number; to: number }) {
  const bad = to < 0;
  return (
    <p className={`rounded-md px-3 py-2 text-sm ${bad ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-700'}`} role="status">
      {label}: <span className="font-mono">{from}</span> → <span className="font-mono font-medium">{Number.isFinite(to) ? to : '—'}</span>
      {bad && ' (not enough stock)'}
    </p>
  );
}

/** One dialog for every stock operation; each mode validates with the same Zod schema as the API. */
export function StockDialog({
  mode,
  row,
  onClose,
}: {
  mode: DialogMode | null;
  row: InventoryRow | null;
  onClose: () => void;
}) {
  const open = !!mode && !!row;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      {open && mode && row && <DialogBody key={`${mode}-${row.id}`} mode={mode} row={row} onClose={onClose} />}
    </Dialog>
  );
}

function DialogBody({ mode, row, onClose }: { mode: DialogMode; row: InventoryRow; onClose: () => void }) {
  return (
    <>
      <DialogTitle>
        {TITLES[mode]}
        <span className="mt-0.5 block text-sm font-normal text-muted">
          {row.productName} · <span className="font-mono">{row.sku}</span>
        </span>
      </DialogTitle>
      {mode === 'settings' ? (
        <SettingsForm row={row} onClose={onClose} />
      ) : mode === 'count' ? (
        <CountForm row={row} onClose={onClose} />
      ) : (
        <OperationForm mode={mode} row={row} onClose={onClose} />
      )}
    </>
  );
}

function Actions({ busy, label, onClose, danger }: { busy: boolean; label: string; onClose: () => void; danger?: boolean }) {
  return (
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button color="inherit" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" variant="contained" color={danger ? 'error' : 'primary'} disabled={busy}>
        {busy ? 'Saving…' : label}
      </Button>
    </DialogActions>
  );
}

interface OpValues {
  quantity?: number;
  delta?: number;
  reason?: string;
  referenceNo?: string;
}

function OperationForm({ mode, row, onClose }: { mode: 'in' | 'out' | 'adjust'; row: InventoryRow; onClose: () => void }) {
  const op = useStockOperation();
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = { in: stockInSchema, out: stockOutSchema, adjust: stockAdjustSchema }[mode];
  // The three modes share one form shape; each validates with its own schema (same as the API).
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OpValues>({ resolver: zodResolver(schema) as unknown as Resolver<OpValues> });

  const amount = Number(watch(mode === 'adjust' ? 'delta' : 'quantity'));
  const projected = row.available + (mode === 'in' ? amount : mode === 'out' ? -amount : amount);

  const submit = handleSubmit((v) => {
    setServerError(null);
    op.mutate({ kind: mode, id: row.id, input: v } as never, { onSuccess: onClose, onError: (e) => setServerError(e.message) });
  });

  const err = (name: keyof OpValues) => errors[name];
  return (
    <form onSubmit={submit} noValidate>
      <DialogContent>
        <div className="mt-1 flex flex-col gap-4">
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <p className="text-sm text-muted">
            Available now: <span className="font-mono font-medium text-ink">{row.available}</span>
            {row.reserved > 0 && <> · {row.reserved} reserved for open orders</>}
          </p>
          {mode === 'adjust' ? (
            <FormField
              autoFocus
              label="Change (+ or −)"
              type="number"
              hint="Use a negative number to reduce stock, e.g. −2"
              error={err('delta')}
              {...register('delta', numberField)}
            />
          ) : (
            <FormField autoFocus label="Quantity" type="number" slotProps={{ htmlInput: { min: 1 } }} error={err('quantity')} {...register('quantity', numberField)} />
          )}
          {Number.isFinite(amount) && amount !== 0 && <Preview label="Available after" from={row.available} to={projected} />}
          <FormField
            label={mode === 'in' ? 'Reason (optional)' : 'Reason'}
            placeholder={mode === 'in' ? 'e.g. Supplier delivery' : mode === 'out' ? 'e.g. Damaged, sample, offline sale' : 'e.g. Found during shelf audit'}
            error={err('reason')}
            {...register('reason', mode === 'in' ? optionalText : undefined)}
          />
          <FormField label="Reference no. (optional)" hint="Purchase order, invoice or GRN number. Generated if left blank." error={err('referenceNo')} {...register('referenceNo', optionalText)} />
        </div>
      </DialogContent>
      <Actions busy={op.isPending} onClose={onClose} label={TITLES[mode]} danger={mode === 'out'} />
    </form>
  );
}

const countFormSchema = stockCountSchema;
type CountValues = z.infer<typeof countFormSchema>;

function CountForm({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const count = useRecordCount();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CountValues>({ resolver: zodResolver(countFormSchema) });
  const counted = Number(watch('countedQty'));
  const diff = counted - row.available;

  return (
    <form
      onSubmit={handleSubmit((v) => {
        setServerError(null);
        count.mutate({ id: row.id, input: v }, { onSuccess: onClose, onError: (e) => setServerError(e.message) });
      })}
      noValidate
    >
      <DialogContent>
        <div className="mt-1 flex flex-col gap-4">
          {serverError && <Alert severity="error">{serverError}</Alert>}
          {row.openCount && <Alert severity="warning">There is already an open count for this SKU. Resolve it first.</Alert>}
          <p className="text-sm text-muted">
            System says <span className="font-mono font-medium text-ink">{row.available}</span> units are available. Count what is physically on the shelf.
          </p>
          <FormField autoFocus label="Counted quantity" type="number" slotProps={{ htmlInput: { min: 0 } }} error={errors.countedQty} {...register('countedQty', numberField)} />
          {Number.isFinite(counted) && (
            <p className={`rounded-md px-3 py-2 text-sm ${diff === 0 ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`} role="status">
              {diff === 0 ? 'Matches the system.' : `Discrepancy: ${diff > 0 ? '+' : ''}${diff} units. It will be saved for your review; stock changes only when you apply it.`}
            </p>
          )}
          <FormField label="Note (optional)" error={errors.reason} {...register('reason', optionalText)} />
        </div>
      </DialogContent>
      <Actions busy={count.isPending} onClose={onClose} label="Record count" />
    </form>
  );
}

const settingsFormSchema = inventorySettingsSchema.extend({ warehouseId: z.string() });
type SettingsValues = z.infer<typeof settingsFormSchema>;

function SettingsForm({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const save = useUpdateInventorySettings();
  const { data: warehouses = [] } = useWarehouses();
  const createWh = useCreateWarehouse();
  const [serverError, setServerError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newWh, setNewWh] = useState({ name: '', location: '' });
  const [whError, setWhError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: { reorderLevel: row.reorderLevel, warehouseId: row.warehouse.id },
  });

  useEffect(() => setValue('warehouseId', row.warehouse.id), [row.warehouse.id, setValue]);

  function addWarehouse() {
    const parsed = warehouseSchema.safeParse({ name: newWh.name, location: newWh.location || null });
    if (!parsed.success) return setWhError(parsed.error.issues[0]?.message ?? 'Invalid warehouse');
    setWhError(null);
    createWh.mutate(parsed.data, {
      onSuccess: (w) => {
        setValue('warehouseId', w.id);
        setAdding(false);
        setNewWh({ name: '', location: '' });
      },
      onError: (e) => setWhError(e.message),
    });
  }

  return (
    <form
      onSubmit={handleSubmit((v) => {
        setServerError(null);
        save.mutate({ id: row.id, input: v }, { onSuccess: onClose, onError: (e) => setServerError(e.message) });
      })}
      noValidate
    >
      <DialogContent>
        <div className="mt-1 flex flex-col gap-4">
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <FormField
            autoFocus
            label="Reorder level"
            type="number"
            hint="You are alerted when available stock falls to this number."
            error={errors.reorderLevel}
            {...register('reorderLevel', numberField)}
          />
          <FormField select label="Warehouse / location" value={watch('warehouseId')} onChange={(e) => setValue('warehouseId', e.target.value, { shouldDirty: true })}>
            {warehouses.map((w) => (
              <MenuItem key={w.id} value={w.id}>
                {w.name}
                {w.location ? ` · ${w.location}` : ''}
              </MenuItem>
            ))}
          </FormField>
          {adding ? (
            <div className="space-y-3 rounded-md border border-line p-3">
              {whError && <p className="text-sm text-danger">{whError}</p>}
              <FormField size="small" label="New warehouse name" value={newWh.name} onChange={(e) => setNewWh({ ...newWh, name: e.target.value })} />
              <FormField size="small" label="Location (optional)" value={newWh.location} onChange={(e) => setNewWh({ ...newWh, location: e.target.value })} />
              <div className="flex gap-2">
                <Button size="small" variant="outlined" disabled={createWh.isPending} onClick={addWarehouse}>
                  Add warehouse
                </Button>
                <Button size="small" color="inherit" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="small" className="self-start" onClick={() => setAdding(true)}>
              + New warehouse
            </Button>
          )}
        </div>
      </DialogContent>
      <Actions busy={save.isPending} onClose={onClose} label="Save settings" />
    </form>
  );
}
