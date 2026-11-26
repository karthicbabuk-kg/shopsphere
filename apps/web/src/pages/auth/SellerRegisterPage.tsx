import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { registerSellerSchema, type RegisterSellerInput } from '@shopsphere/shared-validation';
import { AuthLayout } from '../../layouts/AuthLayout';
import { FormField } from '../../components/FormField';
import { registerSeller } from '../../features/auth/authApi';
import { homeFor, useAuth } from '../../store/auth';

const optional = { setValueAs: (v: string) => (v === '' ? undefined : v) };

export function SellerRegisterPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterSellerInput>({ resolver: zodResolver(registerSellerSchema) });

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerSeller(values);
      navigate('/seller', { replace: true });
    } catch (e) {
      setServerError((e as Error).message);
    }
  });

  return (
    <AuthLayout
      wide
      title="Open your store"
      subtitle="Apply as a seller. An administrator reviews every application before you can publish products."
      footer={
        <>
          Already a seller?{' '}
          <Link to="/login" className="font-bold text-blue-600">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        {serverError && (
          <Alert severity="error" className="sm:col-span-2">
            {serverError}
          </Alert>
        )}
        <p className="font-mono text-xs tracking-wider text-muted uppercase sm:col-span-2">
          Business
        </p>
        <FormField
          label="Business name"
          error={errors.businessName}
          {...register('businessName')}
        />
        <FormField label="GSTIN (optional)" error={errors.gstin} {...register('gstin', optional)} />
        <FormField label="Store name" error={errors.storeName} {...register('storeName')} />
        <FormField
          label="Store description (optional)"
          multiline
          minRows={2}
          error={errors.storeDescription}
          {...register('storeDescription', optional)}
        />
        <p className="mt-2 font-mono text-xs tracking-wider text-muted uppercase sm:col-span-2">
          Account
        </p>
        <FormField label="Your name" autoComplete="name" error={errors.name} {...register('name')} />
        <FormField
          label="Mobile number"
          inputMode="numeric"
          autoComplete="tel-national"
          error={errors.phone}
          {...register('phone')}
        />
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
          autoComplete="new-password"
          error={errors.password}
          {...register('password')}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isSubmitting}
          className="sm:col-span-2"
        >
          {isSubmitting ? 'Submitting…' : 'Submit application'}
        </Button>
      </form>
    </AuthLayout>
  );
}
