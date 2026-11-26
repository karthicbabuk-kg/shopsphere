import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import { FileText, Store, Trash2, Upload } from 'lucide-react';
import { updateStoreSchema, type UpdateStoreInput } from '@shopsphere/shared-validation';
import { PageHeader } from '../../components/PageHeader';
import { FormField } from '../../components/FormField';
import { StatusBadge } from '../../components/StatusBadge';
import {
  DOCUMENT_TYPES,
  useDeleteDocument,
  useSellerProfile,
  useUpdateStore,
  useUploadDocument,
  useUploadLogo,
} from '../../features/seller/sellerApi';
import { thumb } from '../../features/catalog/catalogApi';
import { formatDate } from '../../utils/format';
import { toast } from '../../store/toast';

// Empty text boxes clear the stored value (null) instead of sending empty strings.
const nullable = { setValueAs: (v: string) => (v === '' ? null : v) };

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <h2 className="text-lg">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SellerStorePage() {
  const { data, isLoading, isError } = useSellerProfile();
  const save = useUpdateStore();
  const uploadLogo = useUploadLogo();
  const uploadDoc = useUploadDocument();
  const deleteDoc = useDeleteDocument();
  const logoInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<string>(DOCUMENT_TYPES[0]);

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

  const pickFile = (file: File | undefined, max: number, onOk: (f: File) => void) => {
    if (!file) return;
    if (file.size > max * 1024 * 1024) return toast.error(`"${file.name}" is larger than ${max} MB`);
    onOk(file);
  };

  return (
    <>
      <PageHeader title="Store profile" subtitle="This information is shown to buyers on your store page." />
      <div className="grid max-w-[820px] gap-6">
        <Card title="Store logo" hint="Square image, JPG, PNG or WebP, up to 5 MB.">
          <div className="flex items-center gap-5">
            <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-zone">
              {data.store?.logoUrl ? (
                <img src={thumb(data.store.logoUrl, 160)} alt="Store logo" className="h-full w-full object-cover" />
              ) : (
                <Store size={28} className="text-faint" aria-label="No logo" />
              )}
            </span>
            <Button
              variant="outlined"
              startIcon={<Upload size={16} />}
              disabled={uploadLogo.isPending}
              onClick={() => logoInput.current?.click()}
            >
              {uploadLogo.isPending ? 'Uploading…' : data.store?.logoUrl ? 'Replace logo' : 'Upload logo'}
            </Button>
            <input
              ref={logoInput}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                pickFile(e.target.files?.[0], 5, (f) => uploadLogo.mutate(f));
                e.target.value = '';
              }}
            />
          </div>
        </Card>

        <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
          <Card title="Store details">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Store name" error={errors.name} {...register('name')} />
              <FormField label="Business name" error={errors.businessName} {...register('businessName')} />
              <div className="sm:col-span-2">
                <FormField label="Description" multiline minRows={3} error={errors.description} {...register('description', nullable)} />
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
            </div>
          </Card>
        </form>

        <Card
          title="Verification documents"
          hint="Demo upload: documents are reviewed by an administrator during approval. Do not upload real identity documents."
        >
          {data.documents.length > 0 && (
            <ul className="mb-4 divide-y divide-line rounded-md border border-line">
              {data.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-medium text-blue-600">
                    <FileText size={16} />
                    {d.type}
                  </a>
                  <span className="flex items-center gap-3">
                    <span className="hidden font-mono text-xs text-muted sm:inline">{formatDate(d.createdAt)}</span>
                    <StatusBadge status={d.status} />
                    <IconButton size="small" color="error" aria-label={`Remove ${d.type}`} disabled={deleteDoc.isPending} onClick={() => deleteDoc.mutate(d.id)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <TextField select size="small" label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)} sx={{ minWidth: 220 }}>
              {DOCUMENT_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" startIcon={<Upload size={16} />} disabled={uploadDoc.isPending} onClick={() => docInput.current?.click()}>
              {uploadDoc.isPending ? 'Uploading…' : 'Upload document'}
            </Button>
            <input
              ref={docInput}
              type="file"
              hidden
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => {
                pickFile(e.target.files?.[0], 5, (file) => uploadDoc.mutate({ file, type: docType }));
                e.target.value = '';
              }}
            />
            <span className="text-xs text-faint">PDF, JPG or PNG · 5 MB</span>
          </div>
        </Card>
      </div>
    </>
  );
}
