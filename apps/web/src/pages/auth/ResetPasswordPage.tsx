import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { passwordSchema } from '@shopsphere/shared-validation';
import { z } from 'zod';
import { AuthLayout } from '../../layouts/AuthLayout';
import { FormField } from '../../components/FormField';
import { resetPassword } from '../../features/auth/authApi';

const formSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setServerError(null);
    try {
      await resetPassword({ token, password });
      navigate('/login', { replace: true });
    } catch (e) {
      setServerError((e as Error).message);
    }
  });

  return (
    <AuthLayout
      title="Choose a new password"
      footer={
        <Link to="/login" className="font-bold text-blue-600">
          Back to sign in
        </Link>
      }
    >
      {!token ? (
        <Alert severity="error">This reset link is incomplete. Request a new one.</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <FormField
            label="New password"
            type="password"
            autoComplete="new-password"
            error={errors.password}
            {...register('password')}
          />
          <FormField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            error={errors.confirm}
            {...register('confirm')}
          />
          <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Update password'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
