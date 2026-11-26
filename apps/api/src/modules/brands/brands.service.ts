import type { BrandInput } from '@shopsphere/shared-validation';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { uniqueSlug } from '../../utils/slug.js';

export const listPublic = () =>
  prisma.brand.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, logoUrl: true },
  });

export const listAdmin = () =>
  prisma.brand.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } });

export async function createBrand(input: BrandInput, actorId: string) {
  if (await prisma.brand.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })) {
    throw AppError.conflict('A brand with this name already exists');
  }
  const slug = await uniqueSlug(input.name, async (s) => !!(await prisma.brand.findUnique({ where: { slug: s } })));
  const brand = await prisma.brand.create({ data: { ...input, logoUrl: input.logoUrl ?? null, slug } });
  await audit({ actorId, action: 'brand.create', entity: 'brand', entityId: brand.id });
  return brand;
}

export async function updateBrand(id: string, input: BrandInput, actorId: string) {
  if (!(await prisma.brand.findUnique({ where: { id } }))) throw AppError.notFound('Brand not found');
  const dup = await prisma.brand.findFirst({
    where: { name: { equals: input.name, mode: 'insensitive' }, id: { not: id } },
  });
  if (dup) throw AppError.conflict('A brand with this name already exists');
  const brand = await prisma.brand.update({ where: { id }, data: { ...input, logoUrl: input.logoUrl ?? null } });
  await audit({ actorId, action: 'brand.update', entity: 'brand', entityId: id });
  return brand;
}

export async function deleteBrand(id: string, actorId: string) {
  const brand = await prisma.brand.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!brand) throw AppError.notFound('Brand not found');
  if (brand._count.products > 0) throw AppError.conflict('This brand is in use. Deactivate it instead of deleting.');
  await prisma.brand.delete({ where: { id } });
  await audit({ actorId, action: 'brand.delete', entity: 'brand', entityId: id });
}
