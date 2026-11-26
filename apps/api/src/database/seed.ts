import { prisma } from './prisma.js';
import { env } from '../config/env.js';
import { hashPassword } from '../utils/security.js';
import { slugify } from '../utils/slug.js';

/**
 * Idempotent seed. Admin password comes from the environment, never from source code.
 * Demo catalogue/orders are added in a later phase.
 */
const CATEGORIES: { name: string; children?: string[] }[] = [
  { name: 'Electronics', children: ['Laptops', 'Headphones', 'Cameras', 'Smart Watches'] },
  { name: 'Mobiles', children: ['Smartphones', 'Mobile Accessories'] },
  { name: 'Fashion', children: ['Men', 'Women', 'Footwear'] },
  { name: 'Home Appliances', children: ['Kitchen Appliances', 'Cleaning Appliances'] },
  { name: 'Furniture', children: ['Living Room', 'Office'] },
  { name: 'Beauty', children: ['Skincare', 'Grooming'] },
  { name: 'Sports', children: ['Fitness', 'Outdoor'] },
  { name: 'Accessories', children: ['Bags', 'Watches'] },
];

const BRANDS = [
  'Aurora', 'NovaTech', 'Pulse Audio', 'Zenith', 'Kairo', 'Veloce', 'Hearth & Co', 'Brewmate', 'UrbanEdge', 'Threadly',
  'Stride', 'Oakline', 'Dwell', 'Glowlab', 'Pure Roots', 'Soleil', 'Peak Active', 'Nomad Gear', 'Tickwell', 'Generic',
];

async function seedAdmin() {
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env before seeding');
  }
  const admin = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: {
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      name: 'Platform Admin',
      role: 'ADMIN',
    },
  });
  console.warn(`Admin: ${admin.email}`);
}

async function seedTaxonomy() {
  let order = 0;
  for (const c of CATEGORIES) {
    const parent = await prisma.category.upsert({
      where: { slug: slugify(c.name) },
      update: {},
      create: { name: c.name, slug: slugify(c.name), sortOrder: order++ * 10 },
    });
    let childOrder = 0;
    for (const child of c.children ?? []) {
      const slug = slugify(`${c.name}-${child}`);
      await prisma.category.upsert({
        where: { slug },
        update: {},
        create: { name: child, slug, parentId: parent.id, sortOrder: childOrder++ * 10 },
      });
    }
  }
  for (const name of BRANDS) {
    await prisma.brand.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { name, slug: slugify(name) },
    });
  }
  // Earlier versions seeded real-world brand names; keep only the fictional demo brands.
  await prisma.brand.deleteMany({ where: { slug: { notIn: BRANDS.map((n) => slugify(n)) }, products: { none: {} } } });
  console.warn(`Categories: ${await prisma.category.count()}, brands: ${await prisma.brand.count()}`);
}

async function main() {
  await seedAdmin();
  await seedTaxonomy();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
