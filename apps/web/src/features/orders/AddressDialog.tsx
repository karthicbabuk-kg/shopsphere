import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import { addressSchema, type AddressInput } from '@shopsphere/shared-validation';
import { FormField } from '../../components/FormField';
import { toast } from '../../store/toast';
import { useAddressMutations, type Address } from './ordersApi';

export const STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Puducherry', 'Punjab',
  'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

type FormValues = z.input<typeof addressSchema>;
const EMPTY: FormValues = { label: 'Home', name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', isDefault: false };

/** Add or edit a delivery address. Validation mirrors the API (same shared schema). */
export function AddressDialog({
  open,
  address,
  onClose,
  onSaved,
}: {
  open: boolean;
  address?: Address | null;
  onClose: () => void;
  onSaved?: (a: Address) => void;
}) {
  const { create, update } = useAddressMutations();
  const busy = create.isPending || update.isPending;
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, AddressInput>({ resolver: zodResolver(addressSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) reset(address ? { ...address, line2: address.line2 ?? '' } : EMPTY);
  }, [open, address, reset]);

  const submit = handleSubmit(async (v) => {
    try {
      const res = address ? await update.mutateAsync({ ...v, id: address.id }) : await create.mutateAsync(v);
      toast.success(address ? 'Address updated' : 'Address saved');
      onSaved?.(res.address);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit} noValidate>
        <DialogTitle>{address ? 'Edit address' : 'Add a delivery address'}</DialogTitle>
        <DialogContent>
          <div className="mt-1 grid gap-4 sm:grid-cols-2">
            <FormField label="Full name" autoComplete="name" error={errors.name} {...register('name')} />
            <FormField label="Mobile number" autoComplete="tel-national" inputMode="numeric" error={errors.phone} hint="10-digit number" {...register('phone')} />
            <div className="sm:col-span-2"><FormField label="House no., street" autoComplete="address-line1" error={errors.line1} {...register('line1')} /></div>
            <div className="sm:col-span-2"><FormField label="Area, landmark (optional)" autoComplete="address-line2" error={errors.line2} {...register('line2')} /></div>
            <FormField label="City" autoComplete="address-level2" error={errors.city} {...register('city')} />
            <Controller
              control={control}
              name="state"
              render={({ field }) => (
                <FormField select label="State" error={errors.state} {...field} inputRef={field.ref}>
                  {STATES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </FormField>
              )}
            />
            <FormField label="PIN code" autoComplete="postal-code" inputMode="numeric" error={errors.pincode} {...register('pincode')} />
            <FormField label="Label" error={errors.label} hint="Home, Work…" {...register('label')} />
          </div>
          <Controller
            control={control}
            name="isDefault"
            render={({ field }) => (
              <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Make this my default address" />
            )}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={busy} color="inherit">Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
