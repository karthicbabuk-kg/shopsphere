import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { sellerReasonSchema, type SellerReasonInput } from '@shopsphere/shared-validation';
import { FormField } from './FormField';

/** Confirmation dialog that collects a mandatory reason for destructive admin actions. */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SellerReasonInput>({ resolver: zodResolver(sellerReasonSchema) });

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit((v) => onConfirm(v.reason))} noValidate>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <p className="mb-4 text-sm text-muted">{description}</p>
          <FormField
            autoFocus
            label="Reason"
            multiline
            minRows={3}
            error={errors.reason}
            {...register('reason')}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={busy} color="inherit">
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="error" disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
