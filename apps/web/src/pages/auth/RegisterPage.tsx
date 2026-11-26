import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { registerBuyerSchema, type RegisterBuyerInput } from '@shopsphere/shared-validation';
import { AuthLayout } from '../../layouts/AuthLayout';
import { FormField } from '../../components/FormField';
import { registerBuyer } from '../../features/auth/authApi';
import { homeFor, useAuth } from '../../store/auth';

export function RegisterPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterBuyerInput>({ resolver: zodResolver(registerBuyerSchema) });

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerBuyer({ ...values, phone: values.phone || undefined });
      navigate('/', { replace: true });
    } catch (e) {
      setServerError((e as Error).message);
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Shop from verified sellers across India."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-bold text-blue-600">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {serverError && <Alert severity="error">{serverError}</Alert>}
        <FormField label="Full name" autoComplete="name" error={errors.name} {...register('name')} />
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email}
          {...register('email')}
        />
        <FormField
          label="Mobile number (optional)"
          inputMode="numeric"
          autoComplete="tel-national"
          error={errors.phone}
          {...register('phone', { setValueAs: (v: string) => (v === '' ? undefined : v) })}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters with upper and lower case letters and a number"
          error={errors.password}
          {...register('password')}
        />
        <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
