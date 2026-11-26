import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import { settingsSchema, type SettingsInput } from '@shopsphere/shared-validation';
import { PageHeader } from '../../components/PageHeader';
import { useAdminSettings, useSaveSettings } from '../../features/reports/reportsApi';

type Key = keyof SettingsInput;
type Unit = 'rupees' | 'percent' | 'units';

const FIELDS: { key: Key; label: string; unit: Unit; hint: string }[] = [
  { key: 'commissionBp', label: 'Platform commission', unit: 'percent', hint: 'Charged on the goods value of each shipment (delivery excluded).' },
  { key: 'taxRateBp', label: 'GST rate', unit: 'percent', hint: 'Product prices include GST; this sets how much of a total is shown as tax.' },
  { key: 'deliveryFeePaise', label: 'Delivery fee per seller shipment', unit: 'rupees', hint: 'Charged once per seller in an order.' },
  { key: 'freeDeliveryThresholdPaise', label: 'Free delivery above', unit: 'rupees', hint: 'A seller’s shipment at or above this subtotal ships free.' },
  { key: 'minOrderPaise', label: 'Minimum order value', unit: 'rupees', hint: 'Checkout is blocked below this subtotal.' },
  { key: 'lowStockDefault', label: 'Default reorder level', unit: 'units', hint: 'Suggested for new SKUs.' },
];

/** Stored units (paise, basis points) to what an administrator types (rupees, percent). */
const toDisplay = (v: number, u: Unit) => (u === 'units' ? String(v) : String(v / 100));
const fromDisplay = (s: string, u: Unit): number => {
  const n = Number(s.trim());
  if (s.trim() === '' || !Number.isFinite(n)) return NaN;
  return u === 'units' ? n : Math.round(n * 100);
};

export function AdminSettingsPage() {
  const { data, isLoading, isError } = useAdminSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) setForm(Object.fromEntries(FIELDS.map((f) => [f.key, toDisplay(data.values[f.key], f.unit)])));
  }, [data]);

  if (isError) return <Alert severity="error">Could not load settings.</Alert>;
  if (isLoading || !data) return <><PageHeader title="Settings" /><Skeleton variant="rounded" height={420} /></>;

  const dirty = FIELDS.some((f) => form[f.key] !== toDisplay(data.values[f.key], f.unit));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const candidate = Object.fromEntries(FIELDS.map((f) => [f.key, fromDisplay(form[f.key] ?? '', f.unit)]));
    const parsed = settingsSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0] ?? '');
        if (k) next[k] = Number.isNaN(candidate[k]) ? 'Enter a number' : 'Value is outside the allowed range';
      }
      return setErrors(next);
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  const unitAdornment = (u: Unit) => (u === 'rupees' ? { startAdornment: <InputAdornment position="start">₹</InputAdornment> } : u === 'percent' ? { endAdornment: <InputAdornment position="end">%</InputAdornment> } : undefined);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business rules used by the cart, checkout and commission. Changes apply to new carts and orders; existing orders keep the values they were placed with." />
      <form onSubmit={submit} noValidate className="max-w-[760px] rounded-xl border border-line bg-white p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              value={form[f.key] ?? ''}
              onChange={(e) => { setForm((s) => ({ ...s, [f.key]: e.target.value })); setErrors((s) => ({ ...s, [f.key]: '' })); }}
              error={!!errors[f.key]}
              helperText={errors[f.key] || `${f.hint} Default: ${toDisplay(data.defaults[f.key], f.unit)}${f.unit === 'percent' ? '%' : f.unit === 'rupees' ? ' rupees' : ''}.`}
              slotProps={{ input: unitAdornment(f.unit), htmlInput: { inputMode: 'decimal' } }}
            />
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <Button type="submit" variant="contained" disabled={!dirty || save.isPending}>{save.isPending ? 'Saving…' : 'Save settings'}</Button>
          <Button color="inherit" disabled={!dirty || save.isPending} onClick={() => { setForm(Object.fromEntries(FIELDS.map((f) => [f.key, toDisplay(data.values[f.key], f.unit)]))); setErrors({}); }}>Discard changes</Button>
        </div>
      </form>
      <p className="mt-4 max-w-[760px] text-sm text-muted">Every change is recorded in the audit log with the previous and new values.</p>
    </div>
  );
}
