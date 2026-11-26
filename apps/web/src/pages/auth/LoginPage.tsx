import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { loginSchema, type LoginInput } from '@shopsphere/shared-validation';
import { AuthLayout } from '../../layouts/AuthLayout';
import { FormField } from '../../components/FormField';
import { login } from '../../features/auth/authApi';
import { homeFor, useAuth } from '../../store/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth((s) => s.user);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const from = (location.state as { from?: string } | null)?.from;
  if (user) return <Navigate to={from ?? homeFor(user.role)} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const u = await login(values);
      navigate(from ?? homeFor(u.role), { replace: true });
    } catch (e) {
      setServerError((e as Error).message);
    }
  });

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back to ShopSphere."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-bold text-blue-600">
            Create an account
          </Link>{' '}
          · Selling?{' '}
          <Link to="/seller/register" className="font-bold text-blue-600">
            Open a store
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {serverError && <Alert severity="error">{serverError}</Alert>}
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email}
          {...register('email')}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
          {...register('password')}
        />
        <Link to="/forgot-password" className="self-end text-sm font-medium text-blue-600">
          Forgot password?
        </Link>
        <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
