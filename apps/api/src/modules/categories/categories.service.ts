import type { CategoryInput } from '@shopsphere/shared-validation';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { uniqueSlug } from '../../utils/slug.js';

const publicSelect = { id: true, name: true, slug: true, imageUrl: true, parentId: true, sortOrder: true } as const;

/** Active categories as a two-level tree for navigation and forms. */
export async function listPublicTree() {
  const rows = await prisma.category.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: publicSelect,
  });
  const children = rows.filter((r) => r.parentId);
  return rows
    .filter((r) => !r.parentId)
    .map((r) => ({ ...r, children: children.filter((c) => c.parentId === r.id) }));
}

export async function listAdmin() {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true, children: true } } },
  });
  return rows;
}

async function assertParentValid(parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw AppError.badRequest('A category cannot be its own parent');
  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent) throw AppError.badRequest('Parent category not found');
  if (parent.parentId) throw AppError.badRequest('Categories can be nested one level deep only');
}

export async function createCategory(input: CategoryInput, actorId: string) {
  await assertParentValid(input.parentId);
  const exists = await prisma.category.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' }, parentId: input.parentId ?? null } });
  if (exists) throw AppError.conflict('A category with this name already exists here');
  const slug = await uniqueSlug(input.name, async (s) => !!(await prisma.category.findUnique({ where: { slug: s } })));
  const cat = await prisma.category.create({
    data: { ...input, parentId: input.parentId ?? null, imageUrl: input.imageUrl ?? null, slug },
  });
  await audit({ actorId, action: 'category.create', entity: 'category', entityId: cat.id });
  return cat;
}

export async function updateCategory(id: string, input: CategoryInput, actorId: string) {
  const current = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { children: true } } } });
  if (!current) throw AppError.notFound('Category not found');
  await assertParentValid(input.parentId, id);
  if (input.parentId && current._count.children > 0) {
    throw AppError.badRequest('A category that has sub-categories cannot become a sub-category');
  }
  const cat = await prisma.category.update({
    where: { id },
    data: { ...input, parentId: input.parentId ?? null, imageUrl: input.imageUrl ?? null },
  });
  await audit({ actorId, action: 'category.update', entity: 'category', entityId: id });
  return cat;
}

export async function deleteCategory(id: string, actorId: string) {
  const cat = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true, children: true } } },
  });
  if (!cat) throw AppError.notFound('Category not found');
  if (cat._count.products > 0 || cat._count.children > 0) {
    throw AppError.conflict('This category is in use. Deactivate it instead of deleting.');
  }
  await prisma.category.delete({ where: { id } });
  await audit({ actorId, action: 'category.delete', entity: 'category', entityId: id });
}
