import { randomBytes } from 'node:crypto';

export const slugify = (s: string, max = 60) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '') || 'item';

/** Returns `base` if free, otherwise `base-xxxxxx`. `exists` must check the unique column. */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
  const slug = slugify(base);
  if (!(await exists(slug))) return slug;
  for (let i = 0; i < 5; i++) {
    const candidate = `${slug}-${randomBytes(3).toString('hex')}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${slug}-${randomBytes(6).toString('hex')}`;
}
