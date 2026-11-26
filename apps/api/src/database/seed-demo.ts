/**
 * Demo catalogue seed: 2 approved sellers + 1 pending seller, 5 buyers, 39 products with stock
 * and reviews, coupons and a few notifications. Idempotent (safe to run repeatedly).
 * Requires `pnpm db:seed` first (categories, brands) and src/database/demo-images.json
 * (generate with `pnpm --filter @shopsphere/api demo:images`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './prisma.js';
import { hashPassword } from '../utils/security.js';
import { toPaise } from '@shopsphere/shared-config';
import { createInventoryWithOpening } from '../modules/inventory/inventory.service.js';
import { SETTING_DEFAULTS } from '../modules/settings/settings.service.js';
import { DEMO_BUYERS, DEMO_PASSWORD, DEMO_PRODUCTS, DEMO_SELLERS, REVIEW_TEXTS } from './demo-data.js';

const here = dirname(fileURLToPath(import.meta.url));
const IMAGES_FILE = join(here, 'demo-images.json');

type Images = Record<string, { url: string; publicId: string }[]>;

async function seedSellers(passwordHash: string) {
  for (const s of Object.values(DEMO_SELLERS)) {
    await prisma.user.upsert({
      where: { id: s.userId },
      update: {},
      create: {
        id: s.userId,
        email: s.email,
        passwordHash,
        name: s.name,
        phone: s.phone,
        role: 'SELLER',
        seller: {
          create: {
            id: s.id,
            businessName: s.businessName,
            gstin: s.gstin,
            status: s.status,
            approvedAt: s.status === 'APPROVED' ? new Date() : null,
            store: {
              create: {
                name: s.storeName,
                slug: s.slug,
                description: s.description,
                contactEmail: s.email,
                contactPhone: s.phone,
                city: s.city,
                state: s.state,
              },
            },
            warehouses: { create: { name: 'Main warehouse', location: s.city, isDefault: true } },
          },
        },
      },
    });
  }
}

async function seedBuyers(passwordHash: string) {
  for (const b of DEMO_BUYERS) {
    const exists = await prisma.user.findUnique({ where: { email: b.email } });
    if (exists) continue;
    await prisma.user.create({
      data: {
        email: b.email,
        passwordHash,
        name: b.name,
        phone: b.phone,
        role: 'BUYER',
        buyerProfile: { create: { wishlist: { create: {} } } },
        cart: { create: {} },
        addresses: {
          create: {
            label: 'Home',
            name: b.name,
            phone: b.phone,
            line1: b.line1,
            city: b.city,
            state: b.state,
            pincode: b.pincode,
            isDefault: true,
          },
        },
      },
    });
  }
}

async function seedProducts(images: Images) {
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
  const brands = new Map((await prisma.brand.findMany()).map((b) => [b.slug, b.id]));
  const day = 24 * 3600 * 1000;
  let created = 0;

  for (const [index, p] of DEMO_PRODUCTS.entries()) {
    if (await prisma.product.findUnique({ where: { slug: p.slug } })) continue;
    const categoryId = categories.get(p.category);
    const brandId = brands.get(p.brand);
    if (!categoryId) throw new Error(`Unknown category slug: ${p.category}`);
    if (!brandId) throw new Error(`Unknown brand slug: ${p.brand}`);
    const imgs = images[p.slug];
    if (!imgs?.length) throw new Error(`No images for ${p.slug}. Run: pnpm --filter @shopsphere/api demo:images`);
    const seller = DEMO_SELLERS[p.seller];
    // Spread creation dates over ~75 days so "new arrivals" is meaningful; the last few are within a week.
    const createdAt = new Date(Date.now() - ((index * 37) % 75) * day - index * 3600 * 1000);

    await prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { sellerId: seller.id } });
      const product = await tx.product.create({
        data: {
          sellerId: seller.id,
          categoryId,
          brandId,
          name: p.name,
          slug: p.slug,
          description: p.description,
          mrpPaise: toPaise(p.mrp),
          pricePaise: toPaise(p.price),
          status: 'ACTIVE',
          approval: 'APPROVED',
          soldCount: p.sold,
          createdAt,
          images: { create: imgs.map((i, position) => ({ url: i.url, publicId: i.publicId, position })) },
          attributes: { create: p.attrs.map(([key, value], position) => ({ key, value, position })) },
        },
      });
      for (const [i, v] of p.variants.entries()) {
        const sku = `${p.slug.split('-').slice(0, 2).map((w) => w.slice(0, 3)).join('')}-${index + 1}${String.fromCharCode(65 + i)}`.toUpperCase();
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku,
            label: v.label,
            optionValues: v.options ?? {},
            pricePaise: v.price ? toPaise(v.price) : null,
          },
        });
        await createInventoryWithOpening(tx, {
          variantId: variant.id,
          warehouseId: warehouse.id,
          sellerId: seller.id,
          openingStock: v.stock,
          reorderLevel: v.reorder ?? 5,
          userId: seller.userId,
          referenceNo: `OPEN-${sku}`,
        });
      }
    });
    created++;
  }
  return created;
}

/** Deterministic reviews from the five demo buyers; also refreshes each product's rating aggregate. */
async function seedReviews() {
  const buyers = await prisma.user.findMany({ where: { email: { in: DEMO_BUYERS.map((b) => b.email) } }, orderBy: { email: 'asc' } });
  const products = await prisma.product.findMany({ where: { slug: { in: DEMO_PRODUCTS.map((p) => p.slug) } }, orderBy: { slug: 'asc' } });
  let added = 0;
  for (const [pi, product] of products.entries()) {
    const count = 2 + (pi % 4); // 2..5 reviews
    for (let k = 0; k < count; k++) {
      const buyer = buyers[(pi + k) % buyers.length]!;
      const text = REVIEW_TEXTS[(pi * 3 + k * 5) % REVIEW_TEXTS.length]!;
      const exists = await prisma.review.findUnique({ where: { productId_userId: { productId: product.id, userId: buyer.id } } });
      if (exists) continue;
      await prisma.review.create({
        data: {
          productId: product.id,
          userId: buyer.id,
          rating: text.rating,
          title: text.title,
          body: text.body,
          createdAt: new Date(Date.now() - (pi * 5 + k * 9 + 1) * 24 * 3600 * 1000),
        },
      });
      added++;
    }
    const agg = await prisma.review.aggregate({ where: { productId: product.id }, _avg: { rating: true }, _count: true });
    await prisma.product.update({
      where: { id: product.id },
      data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100, ratingCount: agg._count },
    });
  }
  return added;
}

async function seedCoupons() {
  const coupons = [
    { code: 'WELCOME10', description: '10% off your first order (up to ₹200)', type: 'PERCENT' as const, value: 10, minOrderPaise: toPaise(499), maxDiscountPaise: toPaise(200) },
    { code: 'FLAT100', description: '₹100 off orders above ₹999', type: 'FLAT' as const, value: toPaise(100), minOrderPaise: toPaise(999), maxDiscountPaise: null },
    { code: 'FESTIVE15', description: '15% off orders above ₹1,999 (up to ₹500)', type: 'PERCENT' as const, value: 15, minOrderPaise: toPaise(1999), maxDiscountPaise: toPaise(500) },
  ];
  for (const c of coupons) {
    await prisma.coupon.upsert({ where: { code: c.code }, update: {}, create: { ...c, validTo: new Date(Date.now() + 365 * 24 * 3600 * 1000) } });
  }
}

async function seedSettingsAndNotifications() {
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.platformSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  const seller = DEMO_SELLERS.technest;
  if ((await prisma.notification.count({ where: { userId: seller.userId } })) === 0) {
    await prisma.notification.createMany({
      data: [
        { userId: seller.userId, type: 'seller.approve', title: 'Your store has been approved', body: 'You can now publish products and receive orders.', link: '/seller' },
        { userId: seller.userId, type: 'inventory.low_stock', title: 'Reorder needed: Pulse Immerse Wireless ANC Headphones', body: 'SKU PULIMM-3B is down to 3 (reorder level 5).', link: '/seller/inventory' },
      ],
    });
  }
}

async function main() {
  if (!existsSync(IMAGES_FILE)) {
    throw new Error('demo-images.json is missing. Run: pnpm --filter @shopsphere/api demo:images');
  }
  const images = JSON.parse(readFileSync(IMAGES_FILE, 'utf8')) as Images;
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await seedSellers(passwordHash);
  await seedBuyers(passwordHash);
  const created = await seedProducts(images);
  const reviews = await seedReviews();
  await seedCoupons();
  await seedSettingsAndNotifications();

  console.warn(
    `Demo data ready: ${await prisma.product.count()} products (+${created}), ${await prisma.review.count()} reviews (+${reviews}), ` +
      `${await prisma.user.count({ where: { role: 'BUYER' } })} buyers, ${await prisma.seller.count()} sellers.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
