import { createRequire } from 'node:module';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL!;
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD!;
export const PASSWORD = 'E2eTest1234';

/** Real Cloudinary credentials are required for upload-dependent flows. */
export const hasCloudinary = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

// 1x1 transparent PNG
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Registers a seller through the public form and lands on the seller dashboard. */
export async function registerSellerUI(page: Page, stamp: string) {
  const email = `seller-${stamp}@e2e.local`;
  const storeName = `E2E Store ${stamp}`;
  await page.goto('/seller/register');
  await page.getByLabel('Business name').fill(`E2E Traders ${stamp}`);
  await page.getByLabel('Store name').fill(storeName);
  await page.getByLabel('Your name').fill('E2E Seller');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page).toHaveURL(/\/seller$/);
  return { email, storeName };
}

/** Admin actions through the API (faster than clicking through the UI). */
export async function adminToken(request: APIRequestContext) {
  const res = await request.post('/api/v1/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  return (await res.json()).data.accessToken as string;
}

export async function approveSellerByEmail(request: APIRequestContext, email: string) {
  const token = await adminToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const list = await request.get('/api/v1/admin/sellers', { headers, params: { q: email } });
  const id = (await list.json()).data.items[0].id as string;
  const res = await request.post(`/api/v1/admin/sellers/${id}/approve`, { headers });
  expect(res.ok()).toBeTruthy();
}

/** Creates a draft product with one SKU through the product form. Returns after the draft is saved. */
export async function createDraftProduct(
  page: Page,
  o: { name: string; sku: string; stock: number; reorder: number; price?: number },
) {
  await page.goto('/seller/products/new');
  await page.getByLabel('Product name').fill(o.name);
  await page.getByLabel('Category').click();
  await page.getByRole('option', { name: 'Laptops' }).click();
  await page.getByLabel('Description').fill('A product created by the end-to-end tests to exercise inventory features.');
  await page.getByLabel('MRP (₹)').fill(String((o.price ?? 1000) + 500));
  await page.getByLabel('Selling price (₹)').fill(String(o.price ?? 1000));
  await page.getByLabel('SKU', { exact: true }).fill(o.sku);
  await page.getByLabel('Opening stock').fill(String(o.stock));
  await page.getByLabel('Reorder level').fill(String(o.reorder));
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();
}

// ───────── Orders: API/DB shortcuts so the UI test can focus on the purchase journey ─────────

async function withDb<T>(fn: (c: import('pg').Client) => Promise<T>): Promise<T> {
  const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
  const { Client } = require('pg') as typeof import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Registers an approved seller with one live product (created through the API, then published in the
 * database because the image-based review step is covered by the catalogue tests). Isolated from the
 * demo catalogue so order tests never consume demo stock.
 */
export async function createSellerWithLiveProduct(request: APIRequestContext, stamp: string, o: { price: number; stock: number }) {
  const email = `seller-${stamp}@e2e.local`;
  const reg = await request.post('/api/v1/auth/register-seller', {
    data: { name: 'E2E Seller', email, password: PASSWORD, phone: '9876543210', businessName: `E2E Traders ${stamp}`, storeName: `E2E Store ${stamp}` },
  });
  expect(reg.ok()).toBeTruthy();
  const token = (await reg.json()).data.accessToken as string;
  await approveSellerByEmail(request, email);

  const categoryId = await withDb(async (c) => (await c.query(`SELECT id FROM categories WHERE "parentId" IS NOT NULL AND active LIMIT 1`)).rows[0].id as string);
  const name = `E2E Order Gadget ${stamp}`;
  const created = await request.post('/api/v1/seller/products', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name,
      description: 'A product created for the end-to-end order journey, long enough to pass validation.',
      categoryId,
      mrpPaise: (o.price + 200) * 100,
      pricePaise: o.price * 100,
      status: 'DRAFT',
      variants: [{ sku: `E2E-${stamp}`.toUpperCase(), label: 'Default', openingStock: o.stock, reorderLevel: 1 }],
    },
  });
  expect(created.status()).toBe(201);
  const product = (await created.json()).data.product as { id: string; slug: string };
  await withDb((c) => c.query(`UPDATE products SET status = 'ACTIVE', approval = 'APPROVED' WHERE id = $1`, [product.id]));
  return { email, name, slug: product.slug, productId: product.id, storeName: `E2E Store ${stamp}` };
}

/**
 * Places an order for the seller's product as a throw-away buyer and walks it to DELIVERED, all through
 * the API. Returns the order number so UI tests can look for it.
 */
export async function deliveredOrderViaApi(request: APIRequestContext, seller: { email: string; slug: string }, stamp: string, qty = 2) {
  const json = async (r: import('@playwright/test').APIResponse) => (await r.json()) as { data: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const reg = await json(await request.post('/api/v1/auth/register', { data: { name: 'API Buyer', email: `apibuyer-${stamp}@e2e.local`, password: PASSWORD } }));
  const buyer = { Authorization: `Bearer ${reg.data.accessToken}` };
  const addr = await json(await request.post('/api/v1/addresses', { headers: buyer, data: { label: 'Home', name: 'Report Buyer', phone: '9876543210', line1: '5 Park Street', city: 'Kolkata', state: 'West Bengal', pincode: '700016' } }));
  const product = await json(await request.get(`/api/v1/products/${seller.slug}`));
  await request.post('/api/v1/cart/items', { headers: buyer, data: { variantId: product.data.product.variants[0].id, quantity: qty } });
  const order = await json(await request.post('/api/v1/orders', { headers: buyer, data: { addressId: addr.data.address.id, paymentMethod: 'UPI' } }));
  const login = await json(await request.post('/api/v1/auth/login', { data: { email: seller.email, password: PASSWORD } }));
  const sellerAuth = { Authorization: `Bearer ${login.data.accessToken}` };
  const sid = order.data.order.shipments[0].id as string;
  for (const a of [{ action: 'accept' }, { action: 'process' }, { action: 'pack' }, { action: 'ship', carrier: 'DTDC' }, { action: 'deliver' }]) {
    const r = await request.post(`/api/v1/seller/orders/${sid}/actions`, { headers: sellerAuth, data: a });
    expect(r.ok()).toBeTruthy();
  }
  return { orderNo: order.data.order.orderNo as string, totalPaise: order.data.order.totalPaise as number };
}
