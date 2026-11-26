import { expect, test } from '@playwright/test';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PNG_1PX,
  approveSellerByEmail,
  hasCloudinary,
  registerSellerUI,
  signIn,
} from './helpers';

const stampOf = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

test('seller creates a draft product with SKUs and opening stock', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  const stamp = stampOf();
  await registerSellerUI(page, stamp);

  await page.getByRole('link', { name: 'Products' }).click();
  await expect(page.getByText('No products yet')).toBeVisible();
  await page.getByRole('link', { name: 'New product' }).first().click();

  // Pending sellers can save drafts but not submit.
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  await expect(page.getByText(/once an administrator approves your store/i)).toBeVisible();

  // Client-side validation.
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('At least 3 characters')).toBeVisible();
  await expect(page.getByText('Choose a category')).toBeVisible();

  const name = `E2E Laptop ${stamp}`;
  await page.getByLabel('Product name').fill(name);
  await page.getByLabel('Category').click();
  await page.getByRole('option', { name: 'Laptops' }).click();
  await page.getByLabel('Description').fill('A powerful and lightweight laptop used for end-to-end testing of the catalogue.');
  await page.getByLabel('MRP (₹)').fill('50000');
  await page.getByLabel('Selling price (₹)').fill('60000');
  await page.getByLabel('SKU', { exact: true }).fill(`E2E-${stamp}`.toUpperCase());
  await page.getByLabel('Opening stock').fill('12');

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Cannot exceed MRP')).toBeVisible();
  await page.getByLabel('Selling price (₹)').fill('45000');
  await expect(page.getByText(/Buyers see 10% off/)).toBeVisible();

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();
  await expect(page).toHaveURL(/\/seller\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Edit product' })).toBeVisible();
  // Saved stock is shown but not editable here (inventory operations own it).
  await expect(page.getByLabel('Available stock')).toBeDisabled();

  await page.getByRole('link', { name: 'All products' }).click();
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('₹45,000.00');
  await expect(row).toContainText('12');

  // A seller whose store is approved can now submit (button enabled after approval).
  await approveSellerByEmail(request, `seller-${stamp}@e2e.local`);
  await page.reload();
  await page.getByRole('link', { name: name }).click();
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeEnabled();
  // ...but submitting without images is blocked.
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Add at least one image before submitting')).toBeVisible();

  expect(errors.filter((e) => !/Failed to load resource.*(422|503)/.test(e)), errors.join('\n')).toEqual([]);
});

test('uploading without server credentials shows an honest error', async ({ page }) => {
  test.skip(hasCloudinary, 'Cloudinary is configured; the unconfigured path is not reachable.');
  const stamp = stampOf();
  await registerSellerUI(page, stamp);
  await page.goto('/seller/products/new');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(page.getByText(/not configured/i)).toBeVisible();
});

test('admin manages categories and brands', async ({ page }) => {
  const stamp = stampOf();
  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.getByRole('link', { name: 'Catalogue' }).click();
  await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /^Electronics/ })).toBeVisible();

  const cat = `E2E Cat ${stamp}`;
  await page.getByRole('button', { name: 'Add category' }).click();
  await page.getByLabel('Name').fill(cat);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Category created')).toBeVisible();
  await expect(page.getByRole('cell', { name: new RegExp(`^${cat}`) })).toBeVisible();

  await page.getByRole('button', { name: `Edit ${cat}` }).click();
  await page.getByLabel('Name').fill(`${cat} Renamed`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Category updated')).toBeVisible();

  await page.getByRole('button', { name: `Delete ${cat} Renamed` }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Category deleted')).toBeVisible();

  await page.getByRole('tab', { name: /Brands/ }).click();
  const brand = `E2E Brand ${stamp}`;
  await page.getByRole('button', { name: 'Add brand' }).click();
  await page.getByLabel('Name').fill(brand);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Brand created')).toBeVisible();
  // Duplicate names are rejected with a clear message.
  await page.getByRole('button', { name: 'Add brand' }).click();
  await page.getByLabel('Name').fill(brand.toLowerCase());
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/already exists/i)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: `Delete ${brand}` }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Brand deleted')).toBeVisible();
});

test('full flow with images: submit, admin approves, seller sees live status', async ({ page, browser, request }) => {
  test.skip(!hasCloudinary, 'Needs real Cloudinary credentials in .env');
  const stamp = stampOf();
  const { email } = await registerSellerUI(page, stamp);
  await approveSellerByEmail(request, email);

  await page.goto('/seller/products/new');
  const name = `E2E Phone ${stamp}`;
  await page.getByLabel('Product name').fill(name);
  await page.getByLabel('Category').click();
  await page.getByRole('option', { name: 'Smartphones' }).click();
  await page.getByLabel('Description').fill('A flagship smartphone listed during automated end-to-end verification.');
  await page.getByLabel('MRP (₹)').fill('30000');
  await page.getByLabel('Selling price (₹)').fill('25000');
  await page.getByLabel('SKU', { exact: true }).fill(`PH-${stamp}`.toUpperCase());
  await page.getByLabel('Opening stock').fill('10');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(page.getByRole('img', { name: 'Product image 1' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Submitted for review')).toBeVisible();

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  await admin.getByRole('link', { name: 'Products' }).click();
  await admin.getByLabel('Search by product, SKU or store').fill(name);
  await admin.getByRole('link', { name }).click();
  await admin.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByText('Product approved and live')).toBeVisible();
  await adminCtx.close();

  await page.goto('/seller/products');
  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('Approved');
});
