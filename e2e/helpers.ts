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
