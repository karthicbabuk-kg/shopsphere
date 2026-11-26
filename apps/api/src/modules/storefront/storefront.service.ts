import type { ProductListQuery } from '@shopsphere/shared-validation';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/errors.js';
import { pageArgs, pageMeta } from '../../utils/pagination.js';

/**
 * A product is publicly visible only when it is submitted, approved, not deleted, its category is
 * active and its seller is approved. Suspending a seller therefore hides every product at once.
 */
export const visibleProduct: Prisma.ProductWhereInput = {
  deletedAt: null,
  status: 'ACTIVE',
  approval: 'APPROVED',
  category: { active: true },
  seller: { status: 'APPROVED', deletedAt: null },
};

const hasStock: Prisma.ProductWhereInput = {
  variants: { some: { deletedAt: null, active: true, inventory: { available: { gt: 0 } } } },
};

export const cardSelect = {
  id: true,
  name: true,
  slug: true,
  pricePaise: true,
  mrpPaise: true,
  ratingAvg: true,
  ratingCount: true,
  soldCount: true,
  createdAt: true,
  brand: { select: { name: true, slug: true } },
  seller: { select: { store: { select: { name: true, slug: true } } } },
  images: { orderBy: { position: 'asc' }, take: 2, select: { url: true } },
  variants: { where: { deletedAt: null, active: true }, select: { inventory: { select: { available: true } } } },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

/** Integer percentage off, rounded down. */
export const discountPct = (mrp: number, price: number) =>
  mrp > price ? Math.floor(((mrp - price) * 100) / mrp) : 0;

export function toCard(p: CardRow) {
  const stock = p.variants.reduce((n, v) => n + (v.inventory?.available ?? 0), 0);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    store: p.seller.store,
    pricePaise: p.pricePaise,
    mrpPaise: p.mrpPaise,
    discountPct: discountPct(p.mrpPaise, p.pricePaise),
    ratingAvg: Number(p.ratingAvg),
    ratingCount: p.ratingCount,
    image: p.images[0]?.url ?? null,
    hoverImage: p.images[1]?.url ?? null,
    inStock: stock > 0,
    lowStock: stock > 0 && stock <= 5,
    createdAt: p.createdAt,
  };
}
export type ProductCard = ReturnType<typeof toCard>;

async function categoryIds(slug: string) {
  const cat = await prisma.category.findFirst({
    where: { slug, active: true },
    select: { id: true, name: true, slug: true, parent: { select: { name: true, slug: true } }, children: { where: { active: true }, select: { id: true, name: true, slug: true } } },
  });
  if (!cat) return null;
  return { ids: [cat.id, ...cat.children.map((c) => c.id)], cat };
}

function searchClause(q: string): Prisma.ProductWhereInput {
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 5);
  return {
    AND: terms.map((t) => ({
      OR: [
        { name: { contains: t, mode: 'insensitive' as const } },
        { variants: { some: { deletedAt: null, sku: { contains: t, mode: 'insensitive' as const } } } },
        { brand: { name: { contains: t, mode: 'insensitive' as const } } },
        { category: { name: { contains: t, mode: 'insensitive' as const } } },
      ],
    })),
  };
}

const ORDER: Record<ProductListQuery['sort'], Prisma.ProductOrderByWithRelationInput[]> = {
  popular: [{ soldCount: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  price_asc: [{ pricePaise: 'asc' }, { id: 'asc' }],
  price_desc: [{ pricePaise: 'desc' }, { id: 'asc' }],
  rating: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
};

export async function listProducts(q: ProductListQuery) {
  const cat = q.category ? await categoryIds(q.category) : undefined;
  if (q.category && !cat) throw AppError.notFound('Category not found');

  // Filters that facets must be computed without, so users can still see and switch alternatives.
  const base: Prisma.ProductWhereInput[] = [
    visibleProduct,
    ...(q.q ? [searchClause(q.q)] : []),
    ...(cat ? [{ categoryId: { in: cat.ids } }] : []),
    ...(q.store ? [{ seller: { store: { slug: q.store } } }] : []),
    ...(q.rating ? [{ ratingAvg: { gte: q.rating } }] : []),
    ...(q.inStock ? [hasStock] : []),
  ];
  const brandFilter: Prisma.ProductWhereInput[] = q.brand?.length ? [{ brand: { slug: { in: q.brand } } }] : [];
  const priceFilter: Prisma.ProductWhereInput[] =
    q.minPrice !== undefined || q.maxPrice !== undefined
      ? [{ pricePaise: { ...(q.minPrice !== undefined ? { gte: q.minPrice } : {}), ...(q.maxPrice !== undefined ? { lte: q.maxPrice } : {}) } }]
      : [];

  const where: Prisma.ProductWhereInput = { AND: [...base, ...brandFilter, ...priceFilter] };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy: ORDER[q.sort], ...pageArgs(q), select: cardSelect }),
    prisma.product.count({ where }),
  ]);

  let facets: {
    brands: { slug: string; name: string; count: number }[];
    price: { minPaise: number; maxPaise: number } | null;
    subcategories: { slug: string; name: string }[];
  } | undefined;

  if (q.facets) {
    const [brandGroups, priceRange] = await Promise.all([
      prisma.product.groupBy({ by: ['brandId'], where: { AND: [...base, ...priceFilter] }, _count: true }),
      prisma.product.aggregate({ where: { AND: [...base, ...brandFilter] }, _min: { pricePaise: true }, _max: { pricePaise: true } }),
    ]);
    const ids = brandGroups.flatMap((g) => (g.brandId ? [g.brandId] : []));
    const brands = ids.length ? await prisma.brand.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } }) : [];
    facets = {
      brands: brandGroups
        .flatMap((g) => {
          const b = brands.find((x) => x.id === g.brandId);
          return b ? [{ slug: b.slug, name: b.name, count: g._count }] : [];
        })
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      price: priceRange._min.pricePaise !== null && priceRange._max.pricePaise !== null ? { minPaise: priceRange._min.pricePaise, maxPaise: priceRange._max.pricePaise } : null,
      subcategories: cat?.cat.children ?? [],
    };
  }

  return {
    items: rows.map(toCard),
    meta: pageMeta(q, total),
    facets,
    category: cat ? { name: cat.cat.name, slug: cat.cat.slug, parent: cat.cat.parent } : null,
  };
}

/** Quick suggestions for the search box. */
export async function suggest(q: string) {
  const [products, categories, brands] = await Promise.all([
    prisma.product.findMany({
      where: { AND: [visibleProduct, searchClause(q)] },
      orderBy: [{ soldCount: 'desc' }],
      take: 6,
      select: { name: true, slug: true, pricePaise: true, images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } } },
    }),
    prisma.category.findMany({ where: { active: true, name: { contains: q, mode: 'insensitive' } }, take: 3, select: { name: true, slug: true } }),
    prisma.brand.findMany({ where: { active: true, name: { contains: q, mode: 'insensitive' } }, take: 3, select: { name: true, slug: true } }),
  ]);
  return {
    products: products.map((p) => ({ name: p.name, slug: p.slug, pricePaise: p.pricePaise, image: p.images[0]?.url ?? null })),
    categories,
    brands,
  };
}

const LOW_AT = 10;

export async function getProduct(slug: string) {
  const p = await prisma.product.findFirst({
    where: { AND: [visibleProduct, { slug }] },
    include: {
      images: { orderBy: { position: 'asc' } },
      attributes: { orderBy: { position: 'asc' } },
      brand: { select: { name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true, parentId: true, parent: { select: { name: true, slug: true } } } },
      seller: { select: { id: true, createdAt: true, store: { select: { name: true, slug: true, logoUrl: true, description: true, city: true, state: true } } } },
      variants: {
        where: { deletedAt: null, active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, sku: true, label: true, optionValues: true, pricePaise: true, mrpPaise: true, inventory: { select: { available: true } } },
      },
    },
  });
  if (!p) throw AppError.notFound('Product not found');

  const [distribution, sellerProducts, related] = await Promise.all([
    prisma.review.groupBy({ by: ['rating'], where: { productId: p.id }, _count: true }),
    prisma.product.count({ where: { AND: [visibleProduct, { sellerId: p.seller.id }] } }),
    prisma.product.findMany({
      where: {
        AND: [
          visibleProduct,
          { id: { not: p.id } },
          { categoryId: { in: await relatedCategoryIds(p.category) } },
        ],
      },
      orderBy: [{ soldCount: 'desc' }, { id: 'asc' }],
      take: 8,
      select: cardSelect,
    }),
  ]);

  const counts = Object.fromEntries(distribution.map((d) => [d.rating, d._count]));
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    pricePaise: p.pricePaise,
    mrpPaise: p.mrpPaise,
    discountPct: discountPct(p.mrpPaise, p.pricePaise),
    ratingAvg: Number(p.ratingAvg),
    ratingCount: p.ratingCount,
    soldCount: p.soldCount,
    brand: p.brand,
    category: { name: p.category.name, slug: p.category.slug, parent: p.category.parent },
    images: p.images.map((i) => ({ url: i.url, position: i.position })),
    attributes: p.attributes.map((a) => ({ key: a.key, value: a.value })),
    variants: p.variants.map((v) => {
      const available = v.inventory?.available ?? 0;
      const price = v.pricePaise ?? p.pricePaise;
      const mrp = v.mrpPaise ?? p.mrpPaise;
      return {
        id: v.id,
        sku: v.sku,
        label: v.label,
        options: v.optionValues as Record<string, string>,
        pricePaise: price,
        mrpPaise: mrp,
        discountPct: discountPct(mrp, price),
        inStock: available > 0,
        // Exact counts are only disclosed when stock is scarce ("Only 3 left").
        leftCount: available > 0 && available <= LOW_AT ? available : null,
        maxQty: Math.min(available, 10),
      };
    }),
    seller: {
      store: p.seller.store,
      productCount: sellerProducts,
      memberSince: p.seller.createdAt,
    },
    reviewSummary: {
      average: Number(p.ratingAvg),
      count: p.ratingCount,
      distribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: counts[star] ?? 0 })),
    },
    related: related.map(toCard),
  };
}

async function relatedCategoryIds(c: { id: string; parentId: string | null }) {
  // Siblings under the same parent are relevant too (e.g. Laptops and Headphones under Electronics).
  const parentId = c.parentId ?? c.id;
  const kids = await prisma.category.findMany({ where: { parentId, active: true }, select: { id: true } });
  return [c.id, ...kids.map((k) => k.id)];
}

function maskName(name: string) {
  const [first = 'Customer', ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0)}.` : first;
}

export async function listReviews(slug: string, q: { page: number; pageSize: number; sort: 'recent' | 'high' | 'low' }) {
  const product = await prisma.product.findFirst({ where: { AND: [visibleProduct, { slug }] }, select: { id: true } });
  if (!product) throw AppError.notFound('Product not found');
  const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
    q.sort === 'high' ? [{ rating: 'desc' }, { createdAt: 'desc' }] : q.sort === 'low' ? [{ rating: 'asc' }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }];
  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where: { productId: product.id },
      orderBy,
      ...pageArgs(q),
      select: { id: true, rating: true, title: true, body: true, createdAt: true, user: { select: { name: true } } },
    }),
    prisma.review.count({ where: { productId: product.id } }),
  ]);
  return {
    items: rows.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, createdAt: r.createdAt, author: maskName(r.user.name) })),
    meta: pageMeta(q, total),
  };
}

// ── Home page ──

export async function homeSections() {
  const take = 10;
  const [trending, bestSellers, newArrivals, recommended, offerIds, categories, counts, sellers] = await Promise.all([
    prisma.product.findMany({ where: visibleProduct, orderBy: [{ soldCount: 'desc' }, { id: 'asc' }], take, select: cardSelect }),
    prisma.product.findMany({ where: { AND: [visibleProduct, { ratingAvg: { gte: 4 } }] }, orderBy: [{ soldCount: 'desc' }, { id: 'asc' }], skip: 3, take, select: cardSelect }),
    prisma.product.findMany({ where: visibleProduct, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take, select: cardSelect }),
    prisma.product.findMany({ where: { AND: [visibleProduct, { ratingCount: { gte: 3 } }] }, orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }], take, select: cardSelect }),
    prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM products p
        JOIN sellers s ON s.id = p."sellerId" JOIN categories c ON c.id = p."categoryId"
       WHERE p."deletedAt" IS NULL AND p.status = 'ACTIVE' AND p.approval = 'APPROVED'
         AND s.status = 'APPROVED' AND s."deletedAt" IS NULL AND c.active
         AND p."mrpPaise" > p."pricePaise"
       ORDER BY (p."mrpPaise" - p."pricePaise")::float / p."mrpPaise" DESC, p."soldCount" DESC
       LIMIT ${take}`,
    prisma.category.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, parentId: true } }),
    prisma.product.groupBy({ by: ['categoryId'], where: visibleProduct, _count: true }),
    prisma.seller.findMany({
      where: { status: 'APPROVED', deletedAt: null, products: { some: visibleProduct } },
      select: { id: true, store: { select: { name: true, slug: true, logoUrl: true, description: true, city: true, state: true } }, _count: { select: { products: { where: visibleProduct } } } },
    }),
  ]);

  const offersRaw = offerIds.length
    ? await prisma.product.findMany({ where: { id: { in: offerIds.map((o) => o.id) } }, select: cardSelect })
    : [];
  const offers = offerIds.flatMap((o) => offersRaw.filter((p) => p.id === o.id));

  const countOf = new Map(counts.map((c) => [c.categoryId, c._count]));
  const tops = categories
    .filter((c) => !c.parentId)
    .map((c) => {
      const kids = categories.filter((k) => k.parentId === c.id);
      return {
        name: c.name,
        slug: c.slug,
        productCount: [c.id, ...kids.map((k) => k.id)].reduce((n, id) => n + (countOf.get(id) ?? 0), 0),
        children: kids.map((k) => ({ name: k.name, slug: k.slug })),
      };
    });

  return {
    categories: tops,
    trending: trending.map(toCard),
    bestSellers: bestSellers.map(toCard),
    newArrivals: newArrivals.map(toCard),
    offers: offers.map(toCard),
    recommended: recommended.map(toCard),
    sellers: sellers.flatMap((s) => (s.store ? [{ ...s.store, productCount: s._count.products }] : [])),
  };
}
