import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@shopsphere/shared-validation';
import { AuthLayout } from '../../layouts/AuthLayout';
import { FormField } from '../../components/FormField';
import { forgotPassword } from '../../features/auth/authApi';

export function ForgotPasswordPage() {
  const [result, setResult] = useState<{ message: string; demoResetToken?: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      setResult(await forgotPassword(values));
    } catch (e) {
      setServerError((e as Error).message);
    }
  });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your account email and we will send a reset link."
      footer={
        <Link to="/login" className="font-bold text-blue-600">
          Back to sign in
        </Link>
      }
    >
      {result ? (
        <div className="flex flex-col gap-4" role="status">
          <Alert severity="success">{result.message}</Alert>
          {result.demoResetToken && (
            <Alert severity="info" icon={false}>
              <strong>Demo mode:</strong> no email is sent. Use the link below as if it arrived in
              your inbox.
              <div className="mt-3">
                <Button
                  component={Link}
                  to={`/reset-password?token=${encodeURIComponent(result.demoResetToken)}`}
                  variant="contained"
                  size="small"
                >
                  Open reset link
                </Button>
              </div>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email}
            {...register('email')}
          />
          <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
