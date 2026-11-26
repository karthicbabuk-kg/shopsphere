import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import { ArrowLeft, Plus, Trash2, Wand2 } from 'lucide-react';
import { toPaise } from '@shopsphere/shared-config';
import type { ProductInput } from '@shopsphere/shared-validation';
import { FormField } from '../../components/FormField';
import { ImageUploader } from '../../components/ImageUploader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import {
  useArchiveProduct,
  useBrands,
  useCategories,
  useSaveProduct,
  useSellerProduct,
  type ProductDetail,
} from '../../features/catalog/catalogApi';
import { useSellerProfile } from '../../features/seller/sellerApi';
import { formatINR } from '../../utils/format';

// The form works in rupees; values are converted to integer paise on submit.
const rupees = z.number({ error: 'Enter an amount' }).positive('Must be greater than 0').max(100_000_000);
const optionalRupees = z.number().positive('Must be greater than 0').optional();
const count = (max: number) => z.number({ error: 'Enter a number' }).int('Whole numbers only').min(0).max(max);

const formSchema = z
  .object({
    name: z.string().trim().min(3, 'At least 3 characters').max(120),
    description: z.string().trim().min(20, 'Describe the product in at least 20 characters').max(5000),
    categoryId: z.string().min(1, 'Choose a category'),
    brandId: z.string(),
    mrp: rupees,
    price: rupees,
    images: z.array(z.object({ url: z.string(), publicId: z.string() })).max(8),
    attributes: z.array(z.object({ key: z.string().trim().min(1, 'Required'), value: z.string().trim().min(1, 'Required') })),
    variants: z
      .array(
        z.object({
          variantId: z.string().optional(),
          sku: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-Z0-9][A-Z0-9._-]{2,39}$/, '3-40 letters, numbers, dot, dash'),
          label: z.string().trim().min(1, 'Required').max(60),
          price: optionalRupees,
          openingStock: count(1_000_000),
          reorderLevel: count(100_000),
        }),
      )
      .min(1, 'Add at least one SKU'),
  })
  .superRefine((v, ctx) => {
    if (Number.isFinite(v.price) && Number.isFinite(v.mrp) && v.price > v.mrp) {
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'Cannot exceed MRP' });
    }
    const seen = new Set<string>();
    v.variants.forEach((x, i) => {
      if (seen.has(x.sku)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'sku'], message: 'Duplicate SKU' });
      seen.add(x.sku);
    });
  });
type FormValues = z.infer<typeof formSchema>;

const numberOrUndefined = { setValueAs: (v: string) => (v === '' || v == null ? undefined : Number(v)) };
const randomSku = () => `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const emptyValues: FormValues = {
  name: '',
  description: '',
  categoryId: '',
  brandId: '',
  mrp: undefined as unknown as number,
  price: undefined as unknown as number,
  images: [],
  attributes: [],
  variants: [{ sku: '', label: 'Default', price: undefined, openingStock: 0, reorderLevel: 5 }],
};

function fromProduct(p: ProductDetail): FormValues {
  return {
    name: p.name,
    description: p.description,
    categoryId: p.categoryId,
    brandId: p.brandId ?? '',
    mrp: p.mrpPaise / 100,
    price: p.pricePaise / 100,
    images: p.images.map(({ url, publicId }) => ({ url, publicId })),
    attributes: p.attributes.map(({ key, value }) => ({ key, value })),
    variants: p.variants.map((v) => ({
      variantId: v.id,
      sku: v.sku,
      label: v.label,
      price: v.pricePaise != null ? v.pricePaise / 100 : undefined,
      openingStock: v.inventory?.available ?? 0,
      reorderLevel: v.inventory?.reorderLevel ?? 5,
    })),
  };
}

function toInput(v: FormValues, status: 'DRAFT' | 'ACTIVE'): ProductInput {
  return {
    name: v.name,
    description: v.description,
    categoryId: v.categoryId,
    brandId: v.brandId || null,
    mrpPaise: toPaise(v.mrp),
    pricePaise: toPaise(v.price),
    status,
    images: v.images,
    attributes: v.attributes,
    variants: v.variants.map((x) => ({
      ...(x.variantId ? { id: x.variantId } : {}),
      sku: x.sku,
      label: x.label,
      optionValues: {},
      ...(x.price ? { pricePaise: toPaise(x.price) } : {}),
      openingStock: x.openingStock,
      reorderLevel: x.reorderLevel,
    })),
  };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <h2 className="text-lg">{title}</h2>
      {hint && <p className="mt-1 mb-4 text-sm text-muted">{hint}</p>}
      <div className={hint ? '' : 'mt-4'}>{children}</div>
    </section>
  );
}

export function SellerProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const { data: product, isLoading, isError } = useSellerProduct(id);
  const { data: seller } = useSellerProfile();
  const { data: categories = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const save = useSaveProduct(id);
  const archive = useArchiveProduct();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: emptyValues });
  const attrs = useFieldArray({ control, name: 'attributes' });
  const variants = useFieldArray({ control, name: 'variants' });

  useEffect(() => {
    if (product) reset(fromProduct(product));
  }, [product, reset]);

  const approved = seller?.status === 'APPROVED';
  const suspended = product?.approval === 'SUSPENDED';
  const [mrp, price] = watch(['mrp', 'price']);
  const discount = mrp > 0 && price > 0 && price <= mrp ? Math.round(((mrp - price) / mrp) * 100) : 0;

  const submit = (status: 'DRAFT' | 'ACTIVE') =>
    handleSubmit((values) => {
      setServerError(null);
      if (status === 'ACTIVE' && values.images.length === 0) {
        setError('images', { message: 'Add at least one image before submitting' });
        return;
      }
      save.mutate(toInput(values, status), {
        onSuccess: (p) => navigate(`/seller/products/${p.id}`, { replace: true }),
        onError: (e) => setServerError(e.message),
      });
    });

  if (isEdit && isError) return <Alert severity="error">Product not found.</Alert>;
  if (isEdit && (isLoading || !product)) return <Skeleton variant="rounded" height={480} />;

  const busy = save.isPending;
  return (
    <>
      <Link to="/seller/products" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600">
        <ArrowLeft size={16} /> All products
      </Link>
      <PageHeader
        title={isEdit ? 'Edit product' : 'New product'}
        subtitle={isEdit ? product?.slug : 'Fill in the details, then save a draft or submit for review.'}
        actions={
          isEdit && product?.status !== 'ARCHIVED' ? (
            <Button color="error" variant="outlined" onClick={() => setConfirmArchive(true)}>
              Archive
            </Button>
          ) : undefined
        }
      />

      {isEdit && product && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <StatusBadge status={product.status} tone={product.status === 'ACTIVE' ? 'info' : 'neutral'} />
          {product.status !== 'DRAFT' && <StatusBadge status={product.approval} />}
          {product.rejectionReason && (product.approval === 'REJECTED' || product.approval === 'SUSPENDED') && (
            <span className="text-sm text-muted">Reason: {product.rejectionReason}</span>
          )}
        </div>
      )}
      {suspended && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          This product was suspended by an administrator and cannot be edited.
        </Alert>
      )}
      {serverError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {serverError}
        </Alert>
      )}

      <form noValidate onSubmit={(e) => e.preventDefault()} className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <fieldset disabled={suspended} className="min-w-0 space-y-6 border-0 p-0">
          <Section title="Basic information">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField label="Product name" error={errors.name} {...register('name')} />
              </div>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <FormField select label="Category" error={errors.categoryId} {...field} inputRef={field.ref}>
                    {categories.flatMap((c) =>
                      c.children.length === 0
                        ? [<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>]
                        : [
                            <ListSubheader key={`h-${c.id}`}>{c.name}</ListSubheader>,
                            ...c.children.map((ch) => (
                              <MenuItem key={ch.id} value={ch.id}>
                                {ch.name}
                              </MenuItem>
                            )),
                          ],
                    )}
                  </FormField>
                )}
              />
              <Controller
                control={control}
                name="brandId"
                render={({ field }) => (
                  <FormField select label="Brand (optional)" error={errors.brandId} {...field} inputRef={field.ref}>
                    <MenuItem value="">No brand</MenuItem>
                    {brands.map((b) => (
                      <MenuItem key={b.id} value={b.id}>
                        {b.name}
                      </MenuItem>
                    ))}
                  </FormField>
                )}
              />
              <div className="sm:col-span-2">
                <FormField label="Description" multiline minRows={5} error={errors.description} {...register('description')} />
              </div>
            </div>
          </Section>

          <Section title="Images" hint="The first image is the cover. Up to 8 images, 5 MB each.">
            <Controller
              control={control}
              name="images"
              render={({ field }) => (
                <ImageUploader value={field.value} onChange={(v) => field.onChange(v)} error={errors.images?.message ?? errors.images?.root?.message} />
              )}
            />
          </Section>

          <Section title="Specifications" hint="Shown as a table on the product page, e.g. Material, Warranty, Weight.">
            <div className="space-y-3">
              {attrs.fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-[1fr_1.4fr_auto] items-start gap-3">
                  <FormField size="small" label="Name" error={errors.attributes?.[i]?.key} {...register(`attributes.${i}.key`)} />
                  <FormField size="small" label="Value" error={errors.attributes?.[i]?.value} {...register(`attributes.${i}.value`)} />
                  <IconButton aria-label="Remove specification" onClick={() => attrs.remove(i)}>
                    <Trash2 size={18} />
                  </IconButton>
                </div>
              ))}
              <Button size="small" startIcon={<Plus size={16} />} onClick={() => attrs.append({ key: '', value: '' })}>
                Add specification
              </Button>
            </div>
          </Section>

          <Section
            title="SKUs and stock"
            hint={
              isEdit
                ? 'Existing stock quantities change through inventory operations, not this form.'
                : 'Each SKU is a sellable variant (e.g. a colour or size). Opening stock is recorded in the stock ledger.'
            }
          >
            {errors.variants?.root?.message && <p className="mb-3 text-sm text-danger">{errors.variants.root.message}</p>}
            <div className="space-y-4">
              {variants.fields.map((f, i) => {
                const existing = !!watch(`variants.${i}.variantId`);
                return (
                  <div key={f.id} className="rounded-md border border-line p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="flex items-start gap-1">
                        <FormField size="small" label="SKU" error={errors.variants?.[i]?.sku} {...register(`variants.${i}.sku`)} />
                        {!existing && (
                          <IconButton aria-label="Generate SKU" onClick={() => variants.update(i, { ...watch(`variants.${i}`), sku: randomSku() })}>
                            <Wand2 size={18} />
                          </IconButton>
                        )}
                      </div>
                      <FormField size="small" label="Variant label" error={errors.variants?.[i]?.label} {...register(`variants.${i}.label`)} />
                      <FormField
                        size="small"
                        label="Own price (₹, optional)"
                        type="number"
                        error={errors.variants?.[i]?.price}
                        slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                        {...register(`variants.${i}.price`, numberOrUndefined)}
                      />
                      <FormField
                        size="small"
                        label={existing ? 'Available stock' : 'Opening stock'}
                        type="number"
                        disabled={existing}
                        error={errors.variants?.[i]?.openingStock}
                        slotProps={{ htmlInput: { min: 0 } }}
                        {...register(`variants.${i}.openingStock`, { valueAsNumber: true })}
                      />
                      <FormField
                        size="small"
                        label="Reorder level"
                        type="number"
                        error={errors.variants?.[i]?.reorderLevel}
                        slotProps={{ htmlInput: { min: 0 } }}
                        {...register(`variants.${i}.reorderLevel`, { valueAsNumber: true })}
                      />
                      <div className="flex items-center justify-end">
                        {variants.fields.length > 1 && (
                          <Button size="small" color="error" startIcon={<Trash2 size={16} />} onClick={() => variants.remove(i)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <Button
                size="small"
                startIcon={<Plus size={16} />}
                onClick={() => variants.append({ sku: '', label: '', price: undefined, openingStock: 0, reorderLevel: 5 })}
              >
                Add SKU
              </Button>
            </div>
          </Section>
        </fieldset>

        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Section title="Pricing">
            <div className="grid gap-4">
              <FormField label="MRP (₹)" type="number" error={errors.mrp} slotProps={{ htmlInput: { min: 0, step: '0.01' } }} {...register('mrp', { valueAsNumber: true })} />
              <FormField label="Selling price (₹)" type="number" error={errors.price} slotProps={{ htmlInput: { min: 0, step: '0.01' } }} {...register('price', { valueAsNumber: true })} />
              {discount > 0 && (
                <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                  Buyers see {discount}% off · {formatINR(toPaise(price))}
                </p>
              )}
            </div>
          </Section>

          <Section title="Publish">
            <div className="flex flex-col gap-3">
              <Button variant="outlined" size="large" disabled={busy || suspended || (isEdit && !isDirty)} onClick={() => void submit('DRAFT')()}>
                {busy ? 'Saving…' : 'Save draft'}
              </Button>
              <Button variant="contained" size="large" disabled={busy || suspended || !approved} onClick={() => void submit('ACTIVE')()}>
                {busy ? 'Submitting…' : isEdit && product?.status === 'ACTIVE' ? 'Save and resubmit' : 'Submit for review'}
              </Button>
              {!approved && (
                <p className="text-sm text-muted">Submitting is available once an administrator approves your store. You can still save drafts.</p>
              )}
              <p className="text-xs text-faint">
                Changing the name, description, category, brand or images of an approved product sends it back for review.
              </p>
            </div>
          </Section>
        </aside>
      </form>

      <ConfirmDialog
        open={confirmArchive}
        danger
        busy={archive.isPending}
        title="Archive this product?"
        message="It will be hidden from buyers. Order history and stock records are kept, and you can restore it by saving it again."
        confirmLabel="Archive"
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => id && archive.mutate(id, { onSuccess: () => navigate('/seller/products') })}
      />
    </>
  );
}
