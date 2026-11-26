import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { cleanupDomain, makeBuyer, makeSeller, publishProduct, uniq } from './helpers.js';

const app = createApp();
const DOMAIN = '@storefronttest.local';
const mark = `zq${uniq().replace(/[^a-z]/g, '').slice(0, 6)}`; // unique search token for this run

let seller: Awaited<ReturnType<typeof makeSeller>>;
let other: Awaited<ReturnType<typeof makeSeller>>;
let laptops: string; // child category id
let headphones: string;
let brandA: { id: string; slug: string };
let brandB: { id: string; slug: string };

const list = (params: Record<string, string | number | boolean>) =>
  request(app).get('/api/v1/products').query({ q: mark, ...params });
const names = (res: request.Response) => res.body.data.items.map((i: { name: string }) => i.name);

beforeAll(async () => {
  seller = await makeSeller(app, DOMAIN, { approved: true });
  other = await makeSeller(app, DOMAIN, { approved: true });
  const cats = await prisma.category.findMany({ where: { slug: { in: ['electronics', 'electronics-laptops', 'electronics-headphones'] } } });
  const bySlug = (s: string) => cats.find((c) => c.slug === s)!.id;

  laptops = bySlug('electronics-laptops');
  headphones = bySlug('electronics-headphones');
  const brands = await prisma.brand.findMany({ where: { slug: { in: ['aurora', 'zenith'] } } });
  brandA = brands.find((b) => b.slug === 'aurora')!;
  brandB = brands.find((b) => b.slug === 'zenith')!;
});

afterAll(async () => {
  await cleanupDomain(DOMAIN);
  // Temporary categories can only go once their products are gone.
  await prisma.category.deleteMany({ where: { name: { startsWith: 'ZZ Vis' } } });
  await prisma.$disconnect();
});

describe('visibility rules', () => {
  it('shows only approved, active products from approved sellers', async () => {
    const live = await publishProduct(app, seller, laptops, { name: `${mark} visible laptop` });
    const draft = await publishProduct(app, seller, laptops, { name: `${mark} draft laptop`, publish: false });
    const pending = await publishProduct(app, seller, laptops, { name: `${mark} pending laptop` });
    await prisma.product.update({ where: { id: pending.id }, data: { approval: 'PENDING' } });
    const rejected = await publishProduct(app, seller, laptops, { name: `${mark} rejected laptop` });
    await prisma.product.update({ where: { id: rejected.id }, data: { approval: 'REJECTED' } });
    const suspended = await publishProduct(app, seller, laptops, { name: `${mark} suspended laptop` });
    await prisma.product.update({ where: { id: suspended.id }, data: { approval: 'SUSPENDED' } });
    const archived = await publishProduct(app, seller, laptops, { name: `${mark} archived laptop` });
    await prisma.product.update({ where: { id: archived.id }, data: { status: 'ARCHIVED' } });

    expect(names(await list({}))).toEqual([`${mark} visible laptop`]);
    expect((await request(app).get(`/api/v1/products/${live.slug}`)).status).toBe(200);
    for (const p of [draft, pending, rejected, suspended, archived]) {
      expect((await request(app).get(`/api/v1/products/${p.slug}`)).status, p.slug).toBe(404);
    }
    const suggest = await request(app).get('/api/v1/products/suggest').query({ q: mark });
    expect(suggest.body.data.products.map((p: { name: string }) => p.name)).toEqual([`${mark} visible laptop`]);
  });

  it('hides every product of a suspended seller at once and restores them on reactivation', async () => {
    const s = await makeSeller(app, DOMAIN, { approved: true });
    const p = await publishProduct(app, s, laptops, { name: `${mark} seller-status item` });
    const visible = async () => (await list({ q: `${mark} seller-status` })).body.meta.total;
    expect(await visible()).toBe(1);
    await prisma.seller.update({ where: { id: s.sellerId }, data: { status: 'SUSPENDED' } });
    expect(await visible()).toBe(0);
    expect((await request(app).get(`/api/v1/products/${p.slug}`)).status).toBe(404);
    await prisma.seller.update({ where: { id: s.sellerId }, data: { status: 'APPROVED' } });
    expect(await visible()).toBe(1);
  });

  it('hides products whose category is deactivated', async () => {
    const cat = await prisma.category.create({ data: { name: `ZZ Vis ${uniq()}`, slug: `zz-vis-${uniq()}` } });
    const p = await publishProduct(app, seller, cat.id, { name: `${mark} category-gate` });
    expect((await request(app).get(`/api/v1/products/${p.slug}`)).status).toBe(200);
    await prisma.category.update({ where: { id: cat.id }, data: { active: false } });
    expect((await request(app).get(`/api/v1/products/${p.slug}`)).status).toBe(404);
  });
});

describe('search, filters and sorting', () => {
  const tag = `${mark}f`;
  beforeAll(async () => {
    const day = 24 * 3600 * 1000;
    await publishProduct(app, seller, laptops, { name: `${tag} Alpha Pro`, price: 50000, mrp: 60000, brandId: brandA.id, soldCount: 10, rating: 4.5, createdAt: new Date(Date.now() - 30 * day), variants: [{ sku: `${tag}-ALPHA`.toUpperCase() }] });
    await publishProduct(app, seller, laptops, { name: `${tag} Beta Lite`, price: 30000, mrp: 31000, brandId: brandB.id, soldCount: 99, rating: 3.2, createdAt: new Date(Date.now() - 2 * day) });
    await publishProduct(app, other, headphones, { name: `${tag} Gamma Buds`, price: 2000, mrp: 4000, brandId: brandA.id, soldCount: 50, rating: 4.9, createdAt: new Date(Date.now() - 10 * day) });
    await publishProduct(app, other, headphones, { name: `${tag} Delta Out`, price: 1500, mrp: 1600, brandId: null, stock: 0, soldCount: 1, createdAt: new Date(Date.now() - 1 * day) });
  });
  const f = (params: Record<string, string | number | boolean>) => list({ q: tag, ...params });

  it('searches by name terms (all terms must match), SKU and brand', async () => {
    expect((await f({})).body.meta.total).toBe(4);
    expect(names(await f({ q: `${tag} alpha pro` }))).toEqual([`${tag} Alpha Pro`]);
    expect((await f({ q: `${tag} alpha nonexistentword` })).body.meta.total).toBe(0);
    expect(names(await f({ q: `${tag}-ALPHA`.toLowerCase() }))).toEqual([`${tag} Alpha Pro`]); // SKU, case-insensitive
    expect(names(await f({ q: `${tag} zenith` }))).toEqual([`${tag} Beta Lite`]); // brand name
    expect((await f({ q: `${tag} headphones` })).body.meta.total).toBe(2); // category name
  });

  it('filters by category (parent includes children), brand, price, rating and availability', async () => {
    const parent = await f({ category: 'electronics' });
    expect(parent.body.meta.total).toBe(4);
    expect(parent.body.data.category).toMatchObject({ name: 'Electronics', parent: null });
    expect((await f({ category: 'electronics-laptops' })).body.meta.total).toBe(2);
    expect((await f({ category: 'electronics-headphones' })).body.meta.total).toBe(2);
    expect((await f({ category: 'no-such-category' })).status).toBe(404);

    expect(names(await f({ brand: 'zenith' }))).toEqual([`${tag} Beta Lite`]);
    expect((await f({ brand: 'aurora,zenith' })).body.meta.total).toBe(3);

    expect(names(await f({ minPrice: 180000, maxPrice: 3500000, sort: 'price_asc' }))).toEqual([`${tag} Gamma Buds`, `${tag} Beta Lite`]);
    expect((await f({ rating: 4 })).body.data.items.map((i: { name: string }) => i.name).sort()).toEqual([`${tag} Alpha Pro`, `${tag} Gamma Buds`]);
    const instock = await f({ inStock: true });
    expect(instock.body.meta.total).toBe(3);
    expect(names(instock)).not.toContain(`${tag} Delta Out`);
    const all = await f({});
    expect(all.body.data.items.find((i: { name: string }) => i.name.endsWith('Delta Out')).inStock).toBe(false);
  });

  it('sorts by popularity, price, newest and rating with a stable order', async () => {
    expect(names(await f({ sort: 'popular' }))).toEqual([`${tag} Beta Lite`, `${tag} Gamma Buds`, `${tag} Alpha Pro`, `${tag} Delta Out`]);
    expect(names(await f({ sort: 'price_asc' }))).toEqual([`${tag} Delta Out`, `${tag} Gamma Buds`, `${tag} Beta Lite`, `${tag} Alpha Pro`]);
    expect(names(await f({ sort: 'price_desc' }))[0]).toBe(`${tag} Alpha Pro`);
    expect(names(await f({ sort: 'newest' }))).toEqual([`${tag} Delta Out`, `${tag} Beta Lite`, `${tag} Gamma Buds`, `${tag} Alpha Pro`]);
    expect(names(await f({ sort: 'rating' }))[0]).toBe(`${tag} Gamma Buds`);
  });

  it('paginates and reports totals', async () => {
    const p1 = await f({ pageSize: 3, sort: 'price_asc' });
    expect(p1.body.data.items).toHaveLength(3);
    expect(p1.body.meta).toMatchObject({ page: 1, pageSize: 3, total: 4, totalPages: 2 });
    const p2 = await f({ pageSize: 3, page: 2, sort: 'price_asc' });
    expect(names(p2)).toEqual([`${tag} Alpha Pro`]);
  });

  it('returns facets that ignore their own filter so alternatives stay visible', async () => {
    const res = await f({ facets: true, brand: 'zenith' });
    const { brands, price } = res.body.data.facets;
    // Brand facet counts ignore the brand filter itself; the price range ignores the price filter.
    expect(brands).toEqual(expect.arrayContaining([{ slug: 'aurora', name: 'Aurora', count: 2 }, { slug: 'zenith', name: 'Zenith', count: 1 }]));
    expect(price).toEqual({ minPaise: 3000000, maxPaise: 3000000 }); // only the filtered brand's products
    expect(res.body.data.items).toHaveLength(1);
    const sub = await f({ facets: true, category: 'electronics' });
    expect(sub.body.data.facets.subcategories.map((s: { slug: string }) => s.slug)).toEqual(expect.arrayContaining(['electronics-laptops', 'electronics-headphones']));
  });

  it('rejects invalid queries with 422', async () => {
    expect((await list({ sort: 'cheapest' })).status).toBe(422);
    expect((await list({ minPrice: 500, maxPrice: 100 })).status).toBe(422);
    expect((await list({ pageSize: 500 })).status).toBe(422);
    expect((await request(app).get('/api/v1/products/suggest')).status).toBe(422);
  });

  it('suggests products, categories and brands', async () => {
    const res = await request(app).get('/api/v1/products/suggest').query({ q: `${tag} gamma` });
    expect(res.body.data.products.map((p: { name: string }) => p.name)).toEqual([`${tag} Gamma Buds`]);
    const cat = await request(app).get('/api/v1/products/suggest').query({ q: 'laptop' });
    expect(cat.body.data.categories.map((c: { slug: string }) => c.slug)).toContain('electronics-laptops');
  });
});

describe('product detail and reviews', () => {
  it('returns variants with stock hints, seller info, breadcrumb and related products', async () => {
    const main = await publishProduct(app, seller, laptops, {
      name: `${mark} detail main`,
      price: 900,
      variants: [{ label: 'Plenty', stock: 50 }, { label: 'Scarce', stock: 3 }, { label: 'Gone', stock: 0 }],
    });
    await publishProduct(app, seller, laptops, { name: `${mark} detail sibling`, soldCount: 5 });
    await publishProduct(app, seller, headphones, { name: `${mark} detail cousin`, soldCount: 4 });

    const res = await request(app).get(`/api/v1/products/${main.slug}`);
    expect(res.status).toBe(200);
    const p = res.body.data.product;
    expect(p).toMatchObject({ name: `${mark} detail main`, pricePaise: 90000, mrpPaise: 140000, discountPct: 35 });
    expect(p.variants.map((v: { label: string; inStock: boolean; leftCount: number | null; maxQty: number }) => [v.label, v.inStock, v.leftCount, v.maxQty])).toEqual([
      ['Plenty', true, null, 10],
      ['Scarce', true, 3, 3],
      ['Gone', false, null, 0],
    ]);
    expect(p.category).toMatchObject({ slug: 'electronics-laptops', parent: { slug: 'electronics' } });
    expect(p.seller.store.name).toBeTruthy();
    expect(p.seller.productCount).toBeGreaterThanOrEqual(1);
    const relatedNames = p.related.map((r: { name: string }) => r.name);
    expect(relatedNames).not.toContain(`${mark} detail main`);
    expect(relatedNames).toEqual(expect.arrayContaining([`${mark} detail sibling`, `${mark} detail cousin`]));
    expect(p.attributes).toEqual([]);
    expect((await request(app).get('/api/v1/products/does-not-exist')).status).toBe(404);
  });

  it('lists reviews with masked author names, sorting and paging', async () => {
    const p = await publishProduct(app, seller, laptops, { name: `${mark} reviewed` });
    const buyers = await Promise.all([makeBuyer(app, DOMAIN), makeBuyer(app, DOMAIN), makeBuyer(app, DOMAIN)]);
    const users = await prisma.user.findMany({ where: { email: { in: buyers.map((b) => b.email) } } });
    await prisma.user.updateMany({ where: { id: { in: users.map((u) => u.id) } }, data: { name: 'Priya Kumaran Nair' } });
    for (const [i, u] of users.entries()) {
      await prisma.review.create({ data: { productId: p.id, userId: u.id, rating: [5, 2, 4][i]!, title: `T${i}`, body: `Body ${i}`, createdAt: new Date(Date.now() - i * 86_400_000) } });
    }
    await prisma.product.update({ where: { id: p.id }, data: { ratingAvg: 3.67, ratingCount: 3 } });

    const recent = await request(app).get(`/api/v1/products/${p.slug}/reviews`);
    expect(recent.body.data.items.map((r: { rating: number }) => r.rating)).toEqual([5, 2, 4]);
    expect(recent.body.data.items[0].author).toBe('Priya N.');
    expect(JSON.stringify(recent.body)).not.toContain('@'); // no emails leak
    const low = await request(app).get(`/api/v1/products/${p.slug}/reviews`).query({ sort: 'low' });
    expect(low.body.data.items[0].rating).toBe(2);
    const paged = await request(app).get(`/api/v1/products/${p.slug}/reviews`).query({ pageSize: 2, page: 2 });
    expect(paged.body.data.items).toHaveLength(1);
    expect(paged.body.meta.total).toBe(3);

    const detail = await request(app).get(`/api/v1/products/${p.slug}`);
    expect(detail.body.data.product.reviewSummary).toMatchObject({ count: 3, average: 3.67 });
    expect(detail.body.data.product.reviewSummary.distribution).toEqual([
      { star: 5, count: 1 }, { star: 4, count: 1 }, { star: 3, count: 0 }, { star: 2, count: 1 }, { star: 1, count: 0 },
    ]);
  });
});

describe('home sections', () => {
  it('returns visible products in every section and category counts', async () => {
    const res = await request(app).get('/api/v1/storefront/home');
    expect(res.status).toBe(200);
    const d = res.body.data;
    for (const key of ['trending', 'bestSellers', 'newArrivals', 'offers', 'recommended']) expect(Array.isArray(d[key]), key).toBe(true);
    const all = [...d.trending, ...d.newArrivals, ...d.offers, ...d.recommended];
    expect(all.every((c: { name: string }) => !c.name.includes('draft'))).toBe(true);
    expect(d.categories.length).toBeGreaterThanOrEqual(8);
    expect(d.categories[0]).toHaveProperty('children');
    // Offers are ordered by discount percentage, highest first.
    const pcts = d.offers.map((c: { discountPct: number }) => c.discountPct);
    expect(pcts).toEqual([...pcts].sort((a: number, b: number) => b - a));
  });
});
