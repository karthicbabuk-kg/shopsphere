import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { updateStoreSchema, type UpdateStoreInput } from '@shopsphere/shared-validation';
import { PageHeader } from '../../components/PageHeader';
import { FormField } from '../../components/FormField';
import { useSellerProfile, useUpdateStore } from '../../features/seller/sellerApi';

// Empty text boxes clear the stored value (null) instead of sending empty strings.
const nullable = { setValueAs: (v: string) => (v === '' ? null : v) };

export function SellerStorePage() {
  const { data, isLoading, isError } = useSellerProfile();
  const save = useUpdateStore();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateStoreInput>({ resolver: zodResolver(updateStoreSchema) });

  useEffect(() => {
    if (!data) return;
    reset({
      businessName: data.businessName,
      name: data.store?.name ?? '',
      description: data.store?.description ?? '',
      contactEmail: data.store?.contactEmail ?? '',
      contactPhone: data.store?.contactPhone ?? '',
      city: data.store?.city ?? '',
      state: data.store?.state ?? '',
    });
  }, [data, reset]);

  if (isError) return <Alert severity="error">Could not load your store profile.</Alert>;
  if (isLoading || !data) return <Skeleton variant="rounded" height={420} />;

  return (
    <>
      <PageHeader title="Store profile" subtitle="This information is shown to buyers on your store page." />
      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        noValidate
        className="grid max-w-[720px] gap-4 rounded-lg border border-line bg-white p-6 sm:grid-cols-2"
      >
        <FormField label="Store name" error={errors.name} {...register('name')} />
        <FormField label="Business name" error={errors.businessName} {...register('businessName')} />
        <div className="sm:col-span-2">
          <FormField
            label="Description"
            multiline
            minRows={3}
            error={errors.description}
            {...register('description', nullable)}
          />
        </div>
        <FormField label="Contact email" type="email" error={errors.contactEmail} {...register('contactEmail', nullable)} />
        <FormField label="Contact phone" inputMode="numeric" error={errors.contactPhone} {...register('contactPhone', nullable)} />
        <FormField label="City" error={errors.city} {...register('city', nullable)} />
        <FormField label="State" error={errors.state} {...register('state', nullable)} />
        <div className="sm:col-span-2">
          <Button type="submit" variant="contained" disabled={!isDirty || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </>
  );
}
