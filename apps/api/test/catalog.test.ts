import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/modules/uploads/cloudinary.service.js', async (orig) => {
  const real = await orig<typeof import('../src/modules/uploads/cloudinary.service.js')>();
  return {
    ...real,
    uploadBuffer: vi.fn(async (_buf: Buffer, opts: { folder: string }) => ({
      url: `https://res.cloudinary.com/testcloud/image/upload/v1/${opts.folder}/img.png`,
      publicId: `${opts.folder}/img`,
      bytes: 100,
    })),
    destroyAssets: vi.fn(async () => undefined),
  };
});

import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { anyCategoryId, bearer, cleanupDomain, makeAdmin, makeBuyer, makeSeller, uniq } from './helpers.js';

const app = createApp();
const DOMAIN = '@catalogtest.local';

let adminAuth: ReturnType<typeof bearer>;
let categoryId: string;

const sku = (p = 'SKU') => `${p}-${uniq()}`.toUpperCase();
const image = (sellerId: string, name = 'a') => ({
  url: `https://res.cloudinary.com/testcloud/image/upload/v1/shopsphere/sellers/${sellerId}/products/${name}.png`,
  publicId: `shopsphere/sellers/${sellerId}/products/${name}`,
});

function payload(over: Record<string, unknown> = {}) {
  return {
    name: `Test Product ${uniq()}`,
    description: 'A thoroughly described test product for the catalogue.',
    categoryId,
    mrpPaise: 199900,
    pricePaise: 149900,
    status: 'DRAFT',
    images: [],
    attributes: [{ key: 'Colour', value: 'Black' }],
    variants: [{ sku: sku(), label: 'Default', openingStock: 10, reorderLevel: 3 }],
    ...over,
  };
}

beforeAll(async () => {
  adminAuth = await makeAdmin(app, DOMAIN);
  categoryId = await anyCategoryId();
});

afterAll(async () => {
  await cleanupDomain(DOMAIN);
  await prisma.category.deleteMany({ where: { name: { startsWith: 'ZZ Test' } } });
  await prisma.brand.deleteMany({ where: { name: { startsWith: 'ZZ Test' } } });
  await prisma.$disconnect();
});

describe('categories and brands', () => {
  it('serves the active category tree and brands publicly', async () => {
    const cats = await request(app).get('/api/v1/categories');
    expect(cats.status).toBe(200);
    const electronics = cats.body.data.categories.find((c: { name: string }) => c.name === 'Electronics');
    expect(electronics.children.length).toBeGreaterThan(0);
    const brands = await request(app).get('/api/v1/brands');
    expect(brands.body.data.brands.length).toBeGreaterThan(5);
  });

  it('lets only admins manage them, with validation of nesting and duplicates', async () => {
    const seller = await makeSeller(app, DOMAIN);
    const body = { name: `ZZ Test Cat ${uniq()}` };
    expect((await request(app).post('/api/v1/admin/categories').set(seller.auth).send(body)).status).toBe(403);

    const created = await request(app).post('/api/v1/admin/categories').set(adminAuth).send(body);
    expect(created.status).toBe(201);
    const id = created.body.data.category.id as string;
    expect((await request(app).post('/api/v1/admin/categories').set(adminAuth).send(body)).status).toBe(409);

    const child = await request(app)
      .post('/api/v1/admin/categories')
      .set(adminAuth)
      .send({ name: `ZZ Test Child ${uniq()}`, parentId: id });
    expect(child.status).toBe(201);
    const grandchild = await request(app)
      .post('/api/v1/admin/categories')
      .set(adminAuth)
      .send({ name: `ZZ Test Grand ${uniq()}`, parentId: child.body.data.category.id });
    expect(grandchild.status).toBe(400);

    // Parent with children cannot be deleted; deactivation hides it from the public tree.
    expect((await request(app).delete(`/api/v1/admin/categories/${id}`).set(adminAuth)).status).toBe(409);
    await request(app).put(`/api/v1/admin/categories/${id}`).set(adminAuth).send({ ...body, active: false });
    const tree = await request(app).get('/api/v1/categories');
    expect(tree.body.data.categories.some((c: { id: string }) => c.id === id)).toBe(false);

    expect((await request(app).delete(`/api/v1/admin/categories/${child.body.data.category.id}`).set(adminAuth)).status).toBe(200);
    expect((await request(app).delete(`/api/v1/admin/categories/${id}`).set(adminAuth)).status).toBe(200);
  });

  it('manages brands and blocks duplicates', async () => {
    const name = `ZZ Test Brand ${uniq()}`;
    const ok = await request(app).post('/api/v1/admin/brands').set(adminAuth).send({ name });
    expect(ok.status).toBe(201);
    expect((await request(app).post('/api/v1/admin/brands').set(adminAuth).send({ name: name.toLowerCase() })).status).toBe(409);
    expect((await request(app).delete(`/api/v1/admin/brands/${ok.body.data.brand.id}`).set(adminAuth)).status).toBe(200);
  });
});

describe('seller product creation', () => {
  it('creates a draft with variants, opening stock and an immutable OPENING movement', async () => {
    const s = await makeSeller(app, DOMAIN);
    const res = await request(app)
      .post('/api/v1/seller/products')
      .set(s.auth)
      .send(
        payload({
          variants: [
            { sku: sku('A'), label: 'Black / 128GB', optionValues: { Colour: 'Black' }, openingStock: 10 },
            { sku: sku('B'), label: 'Blue / 128GB', optionValues: { Colour: 'Blue' }, openingStock: 4, reorderLevel: 2 },
          ],
        }),
      );
    expect(res.status).toBe(201);
    const p = res.body.data.product;
    expect(p).toMatchObject({ status: 'DRAFT', approval: 'PENDING', pricePaise: 149900 });
    expect(p.slug).toMatch(/^test-product/);
    expect(p.variants).toHaveLength(2);
    expect(
      p.variants.map((v: { inventory: { available: number } }) => v.inventory.available).sort((a: number, b: number) => a - b),
    ).toEqual([4, 10]);

    const moves = await prisma.stockMovement.findMany({ where: { inventory: { variant: { productId: p.id } } } });
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.type === 'OPENING' && m.previousQty === 0 && m.newQty === m.changeQty)).toBe(true);
    expect(moves.every((m) => m.sellerId === s.sellerId && m.createdById === s.userId)).toBe(true);
  });

  it('ledger rows cannot be edited or deleted, and stock cannot go negative', async () => {
    const s = await makeSeller(app, DOMAIN);
    const res = await request(app).post('/api/v1/seller/products').set(s.auth).send(payload());
    const variantId = res.body.data.product.variants[0].id as string;
    const inv = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
    const mv = await prisma.stockMovement.findFirstOrThrow({ where: { inventoryId: inv.id } });
    await expect(prisma.stockMovement.update({ where: { id: mv.id }, data: { reason: 'tamper' } })).rejects.toThrow(/append-only/);
    await expect(prisma.stockMovement.delete({ where: { id: mv.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.inventory.update({ where: { id: inv.id }, data: { available: -1 } })).rejects.toThrow();
  });

  it('validates price, duplicate SKUs and required fields', async () => {
    const s = await makeSeller(app, DOMAIN);
    const post = (b: unknown) => request(app).post('/api/v1/seller/products').set(s.auth).send(b as object);

    const pricey = await post(payload({ pricePaise: 300000 }));
    expect(pricey.status).toBe(422);
    expect(pricey.body.error.details.fieldErrors.pricePaise ?? pricey.body.error.details.formErrors).toBeTruthy();

    const dup = sku();
    const twice = await post(payload({ variants: [{ sku: dup }, { sku: dup }] }));
    expect(twice.status).toBe(422);

    expect((await post({ name: 'x' })).status).toBe(422);
    expect((await post(payload({ categoryId: '00000000-0000-4000-8000-000000000000' }))).status).toBe(400);
  });

  it('keeps SKUs unique across sellers', async () => {
    const a = await makeSeller(app, DOMAIN);
    const b = await makeSeller(app, DOMAIN);
    const shared = sku('SHARED');
    expect(
      (await request(app).post('/api/v1/seller/products').set(a.auth).send(payload({ variants: [{ sku: shared }] }))).status,
    ).toBe(201);
    const clash = await request(app).post('/api/v1/seller/products').set(b.auth).send(payload({ variants: [{ sku: shared }] }));
    expect(clash.status).toBe(409);
    expect(clash.body.error.message).toContain(shared);
  });

  it('lets a pending seller save drafts but not submit for review', async () => {
    const s = await makeSeller(app, DOMAIN); // PENDING
    const submit = await request(app)
      .post('/api/v1/seller/products')
      .set(s.auth)
      .send(payload({ status: 'ACTIVE', images: [image(s.sellerId)] }));
    expect(submit.status).toBe(403);
    expect((await request(app).post('/api/v1/seller/products').set(s.auth).send(payload())).status).toBe(201);
  });

  it('requires an image to submit and rejects references to other sellers\' images', async () => {
    const a = await makeSeller(app, DOMAIN, { approved: true });
    const b = await makeSeller(app, DOMAIN, { approved: true });
    const noImg = await request(app).post('/api/v1/seller/products').set(a.auth).send(payload({ status: 'ACTIVE' }));
    expect(noImg.status).toBe(422);

    const stolen = await request(app)
      .post('/api/v1/seller/products')
      .set(a.auth)
      .send(payload({ status: 'ACTIVE', images: [image(b.sellerId)] }));
    expect(stolen.status).toBe(400);

    const foreign = await request(app)
      .post('/api/v1/seller/products')
      .set(a.auth)
      .send(payload({ status: 'ACTIVE', images: [{ url: 'https://evil.example/x.png', publicId: `shopsphere/sellers/${a.sellerId}/products/x` }] }));
    expect(foreign.status).toBe(400);

    const ok = await request(app)
      .post('/api/v1/seller/products')
      .set(a.auth)
      .send(payload({ status: 'ACTIVE', images: [image(a.sellerId)] }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.product).toMatchObject({ status: 'ACTIVE', approval: 'PENDING' });
  });

  it('rejects buyers and anonymous callers', async () => {
    const buyer = await makeBuyer(app, DOMAIN);
    expect((await request(app).post('/api/v1/seller/products').set(buyer.auth).send(payload())).status).toBe(403);
    expect((await request(app).get('/api/v1/seller/products')).status).toBe(401);
  });
});

describe('seller data isolation', () => {
  it('hides other sellers\' products from list, read, update and archive', async () => {
    const a = await makeSeller(app, DOMAIN);
    const b = await makeSeller(app, DOMAIN);
    const made = await request(app).post('/api/v1/seller/products').set(a.auth).send(payload());
    const id = made.body.data.product.id as string;

    expect((await request(app).get(`/api/v1/seller/products/${id}`).set(b.auth)).status).toBe(404);
    expect((await request(app).put(`/api/v1/seller/products/${id}`).set(b.auth).send(payload())).status).toBe(404);
    expect((await request(app).delete(`/api/v1/seller/products/${id}`).set(b.auth)).status).toBe(404);
    const listB = await request(app).get('/api/v1/seller/products').set(b.auth);
    expect(listB.body.data.items).toHaveLength(0);
    const listA = await request(app).get('/api/v1/seller/products').set(a.auth);
    expect(listA.body.data.items).toHaveLength(1);
    expect(listA.body.data.items[0]).toMatchObject({ id, stock: 10, skuCount: 1 });
  });

  it('filters and searches own products by name, SKU and status', async () => {
    const s = await makeSeller(app, DOMAIN);
    const needle = sku('NEEDLE');
    await request(app).post('/api/v1/seller/products').set(s.auth).send(payload({ name: 'Findable Gadget', variants: [{ sku: needle }] }));
    await request(app).post('/api/v1/seller/products').set(s.auth).send(payload({ name: 'Other Thing' }));
    const bySku = await request(app).get('/api/v1/seller/products').query({ q: needle.slice(0, 10) }).set(s.auth);
    expect(bySku.body.data.items.map((p: { name: string }) => p.name)).toEqual(['Findable Gadget']);
    const byName = await request(app).get('/api/v1/seller/products').query({ q: 'other', status: 'DRAFT' }).set(s.auth);
    expect(byName.body.data.items).toHaveLength(1);
    expect(byName.body.meta.total).toBe(1);
  });
});

describe('updating products', () => {
  it('adds and removes variants without touching existing stock', async () => {
    const s = await makeSeller(app, DOMAIN);
    const first = sku('V1');
    const made = await request(app)
      .post('/api/v1/seller/products')
      .set(s.auth)
      .send(payload({ variants: [{ sku: first, openingStock: 10 }, { sku: sku('V2'), openingStock: 3 }] }));
    const product = made.body.data.product;
    const [v1, v2] = product.variants;

    // Existing variant's openingStock in the body must be ignored; new variant gets its own opening stock.
    const newSku = sku('V3');
    const res = await request(app)
      .put(`/api/v1/seller/products/${product.id}`)
      .set(s.auth)
      .send(
        payload({
          name: product.name,
          description: product.description,
          variants: [
            { id: v1.id, sku: v1.sku, label: 'Renamed', openingStock: 9999 },
            { sku: newSku, openingStock: 7 },
          ],
        }),
      );
    expect(res.status).toBe(200);
    const variants = res.body.data.product.variants as { id: string; sku: string; label: string; inventory: { available: number } }[];
    expect(variants.map((v) => v.sku).sort()).toEqual([v1.sku, newSku].sort());
    expect(variants.find((v) => v.id === v1.id)).toMatchObject({ label: 'Renamed', inventory: { available: 10 } });
    expect(variants.find((v) => v.sku === newSku)?.inventory.available).toBe(7);

    const removed = await prisma.productVariant.findUniqueOrThrow({ where: { id: v2.id } });
    expect(removed.deletedAt).not.toBeNull();
    // History preserved: 3 OPENING movements (V1, V2, V3) still exist.
    expect(await prisma.stockMovement.count({ where: { inventory: { variant: { productId: product.id } } } })).toBe(3);
  });

  it('refuses to remove a variant that has reserved units', async () => {
    const s = await makeSeller(app, DOMAIN);
    const made = await request(app).post('/api/v1/seller/products').set(s.auth).send(payload({ variants: [{ sku: sku(), openingStock: 5 }, { sku: sku(), openingStock: 5 }] }));
    const product = made.body.data.product;
    const [keep, drop] = product.variants;
    await prisma.inventory.update({ where: { variantId: drop.id }, data: { available: 3, reserved: 2 } });
    const res = await request(app)
      .put(`/api/v1/seller/products/${product.id}`)
      .set(s.auth)
      .send(payload({ name: product.name, description: product.description, variants: [{ id: keep.id, sku: keep.sku }] }));
    expect(res.status).toBe(409);
  });

  it('rejects variant ids that belong to another product', async () => {
    const a = await makeSeller(app, DOMAIN);
    const b = await makeSeller(app, DOMAIN);
    const pa = (await request(app).post('/api/v1/seller/products').set(a.auth).send(payload())).body.data.product;
    const pb = (await request(app).post('/api/v1/seller/products').set(b.auth).send(payload())).body.data.product;
    const res = await request(app)
      .put(`/api/v1/seller/products/${pb.id}`)
      .set(b.auth)
      .send(payload({ name: pb.name, description: pb.description, variants: [{ id: pa.variants[0].id, sku: sku() }] }));
    expect(res.status).toBe(400);
  });

  it('archives instead of deleting and is idempotent', async () => {
    const s = await makeSeller(app, DOMAIN);
    const id = (await request(app).post('/api/v1/seller/products').set(s.auth).send(payload())).body.data.product.id as string;
    const first = await request(app).delete(`/api/v1/seller/products/${id}`).set(s.auth);
    expect(first.body.data.product.status).toBe('ARCHIVED');
    expect((await request(app).delete(`/api/v1/seller/products/${id}`).set(s.auth)).status).toBe(200);
    expect(await prisma.product.count({ where: { id, deletedAt: null } })).toBe(1);
  });
});

describe('admin moderation', () => {
  async function submitted(s: Awaited<ReturnType<typeof makeSeller>>) {
    const res = await request(app)
      .post('/api/v1/seller/products')
      .set(s.auth)
      .send(payload({ status: 'ACTIVE', images: [image(s.sellerId)] }));
    return res.body.data.product as { id: string; name: string; description: string; variants: { id: string; sku: string }[] };
  }

  it('hides drafts from admins and blocks non-admins', async () => {
    const s = await makeSeller(app, DOMAIN, { approved: true });
    const draft = (await request(app).post('/api/v1/seller/products').set(s.auth).send(payload())).body.data.product;
    expect((await request(app).get(`/api/v1/admin/products/${draft.id}`).set(adminAuth)).status).toBe(404);
    expect((await request(app).get('/api/v1/admin/products').set(s.auth)).status).toBe(403);
    expect((await request(app).post(`/api/v1/admin/products/${draft.id}/approve`).set(s.auth)).status).toBe(403);
  });

  it('approves a submitted product, notifies the seller and records an audit entry', async () => {
    const s = await makeSeller(app, DOMAIN, { approved: true });
    const p = await submitted(s);
    const list = await request(app).get('/api/v1/admin/products').query({ approval: 'PENDING', q: p.name }).set(adminAuth);
    expect(list.body.data.items.map((i: { id: string }) => i.id)).toContain(p.id);

    const res = await request(app).post(`/api/v1/admin/products/${p.id}/approve`).set(adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.data.product.approval).toBe('APPROVED');
    const notes = await request(app).get('/api/v1/notifications').set(s.auth);
    expect(notes.body.data.items[0].title).toContain('is now live');
    const log = await prisma.auditLog.findFirst({ where: { entity: 'product', entityId: p.id, action: 'product.approve' } });
    expect(log?.meta).toMatchObject({ from: 'PENDING', to: 'APPROVED' });
  });

  it('requires reasons, enforces transitions, and lets the seller fix and resubmit a rejection', async () => {
    const s = await makeSeller(app, DOMAIN, { approved: true });
    const p = await submitted(s);
    const url = (a: string) => `/api/v1/admin/products/${p.id}/${a}`;

    expect((await request(app).post(url('reject')).set(adminAuth).send({})).status).toBe(422);
    expect((await request(app).post(url('suspend')).set(adminAuth).send({ reason: 'not approved yet' })).status).toBe(409);
    expect((await request(app).post(url('reinstate')).set(adminAuth)).status).toBe(409);

    const rejected = await request(app).post(url('reject')).set(adminAuth).send({ reason: 'Images are blurry' });
    expect(rejected.body.data.product.approval).toBe('REJECTED');
    const seen = await request(app).get(`/api/v1/seller/products/${p.id}`).set(s.auth);
    expect(seen.body.data.product.rejectionReason).toBe('Images are blurry');

    const resubmit = await request(app)
      .put(`/api/v1/seller/products/${p.id}`)
      .set(s.auth)
      .send(payload({ name: p.name, description: p.description, status: 'ACTIVE', images: [image(s.sellerId, 'better')], variants: [{ id: p.variants[0]!.id, sku: p.variants[0]!.sku }] }));
    expect(resubmit.body.data.product).toMatchObject({ approval: 'PENDING', rejectionReason: null });
  });

  it('sends material edits of approved products back to review but not price changes', async () => {
    const s = await makeSeller(app, DOMAIN, { approved: true });
    const p = await submitted(s);
    await request(app).post(`/api/v1/admin/products/${p.id}/approve`).set(adminAuth);
    const base = { name: p.name, description: p.description, status: 'ACTIVE', images: [image(s.sellerId)], variants: [{ id: p.variants[0]!.id, sku: p.variants[0]!.sku }] };

    const priceOnly = await request(app).put(`/api/v1/seller/products/${p.id}`).set(s.auth).send(payload({ ...base, pricePaise: 99900 }));
    expect(priceOnly.body.data.product.approval).toBe('APPROVED');

    const renamed = await request(app).put(`/api/v1/seller/products/${p.id}`).set(s.auth).send(payload({ ...base, name: `${p.name} v2` }));
    expect(renamed.body.data.product.approval).toBe('PENDING');
  });

  it('suspends and reinstates, blocking seller edits while suspended', async () => {
    const s = await makeSeller(app, DOMAIN, { approved: true });
    const p = await submitted(s);
    await request(app).post(`/api/v1/admin/products/${p.id}/approve`).set(adminAuth);
    const sus = await request(app).post(`/api/v1/admin/products/${p.id}/suspend`).set(adminAuth).send({ reason: 'Counterfeit report' });
    expect(sus.body.data.product.approval).toBe('SUSPENDED');
    const edit = await request(app).put(`/api/v1/seller/products/${p.id}`).set(s.auth).send(payload({ name: p.name, description: p.description, variants: [{ id: p.variants[0]!.id, sku: p.variants[0]!.sku }] }));
    expect(edit.status).toBe(403);
    const back = await request(app).post(`/api/v1/admin/products/${p.id}/reinstate`).set(adminAuth);
    expect(back.body.data.product.approval).toBe('APPROVED');
  });

  it('lets only one of two concurrent approvals succeed', async () => {
    const s = await makeSeller(app, DOMAIN, { approved: true });
    const p = await submitted(s);
    const call = () => request(app).post(`/api/v1/admin/products/${p.id}/approve`).set(adminAuth);
    const [x, y] = await Promise.all([call(), call()]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  it('counts pending approvals in the admin overview', async () => {
    const s = await makeSeller(app, DOMAIN, { approved: true });
    await submitted(s);
    const ov = await request(app).get('/api/v1/admin/overview').set(adminAuth);
    expect(ov.body.data.products.pendingApproval).toBeGreaterThanOrEqual(1);
  });
});

describe('uploads', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

  it('uploads valid images into the caller\'s own folder', async () => {
    const s = await makeSeller(app, DOMAIN);
    const res = await request(app)
      .post('/api/v1/uploads/product-images')
      .set(s.auth)
      .attach('files', png, { filename: 'one.png', contentType: 'image/png' })
      .attach('files', png, { filename: 'two.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.images).toHaveLength(2);
    expect(res.body.data.images[0].publicId).toContain(`shopsphere/sellers/${s.sellerId}/products`);
  });

  it('rejects files whose content is not an allowed image even if the MIME type lies', async () => {
    const s = await makeSeller(app, DOMAIN);
    const res = await request(app)
      .post('/api/v1/uploads/product-images')
      .set(s.auth)
      .attach('files', Buffer.from('MZ this is an executable pretending to be an image'), { filename: 'evil.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not an allowed file type/);
  });

  it('rejects empty requests, oversize files, buyers and anonymous callers', async () => {
    const s = await makeSeller(app, DOMAIN);
    const buyer = await makeBuyer(app, DOMAIN);
    expect((await request(app).post('/api/v1/uploads/product-images').set(s.auth)).status).toBe(400);
    const big = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
    const huge = await request(app).post('/api/v1/uploads/product-images').set(s.auth).attach('files', big, { filename: 'big.png', contentType: 'image/png' });
    expect(huge.status).toBe(400);
    expect(huge.body.error.message).toMatch(/5 MB/);
    expect((await request(app).post('/api/v1/uploads/product-images').set(buyer.auth).attach('files', png, 'x.png')).status).toBe(403);
    expect((await request(app).post('/api/v1/uploads/product-images').attach('files', png, 'x.png')).status).toBe(401);
  });

  it('stores seller documents and removes them, scoped to the owner', async () => {
    const a = await makeSeller(app, DOMAIN);
    const b = await makeSeller(app, DOMAIN);
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(32)]);
    const up = await request(app).post('/api/v1/sellers/me/documents').set(a.auth).field('type', 'GST certificate').attach('file', pdf, { filename: 'gst.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    const doc = up.body.data.seller.documents[0];
    expect(doc.type).toBe('GST certificate');

    expect((await request(app).delete(`/api/v1/sellers/me/documents/${doc.id}`).set(b.auth)).status).toBe(404);
    expect((await request(app).delete(`/api/v1/sellers/me/documents/${doc.id}`).set(a.auth)).status).toBe(200);
    const bad = await request(app).post('/api/v1/sellers/me/documents').set(a.auth).field('type', 'Nonsense').attach('file', pdf, 'x.pdf');
    expect(bad.status).toBe(422);
  });

  it('sets a store logo', async () => {
    const s = await makeSeller(app, DOMAIN);
    const res = await request(app).post('/api/v1/sellers/me/logo').set(s.auth).attach('file', png, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.data.seller.store.logoUrl).toContain(`/shopsphere/sellers/${s.sellerId}/store/`);
  });
});
