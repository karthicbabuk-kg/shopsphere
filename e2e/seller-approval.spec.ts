import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, PASSWORD, signIn } from './helpers';

test('seller applies, admin approves, seller sees approval', async ({ page, browser }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  const stamp = Date.now().toString(36);
  const sellerEmail = `seller-${stamp}@e2e.local`;
  const storeName = `E2E Store ${stamp}`;

  // 1. Seller applies through the public form.
  await page.goto('/seller/register');
  await page.getByLabel('Business name').fill(`E2E Traders ${stamp}`);
  await page.getByLabel('Store name').fill(storeName);
  await page.getByLabel('Your name').fill('E2E Seller');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('Email').fill(sellerEmail);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page).toHaveURL(/\/seller$/);
  await expect(page.getByRole('heading', { name: storeName })).toBeVisible();
  await expect(page.getByText(/under review/i)).toBeVisible();

  // 2. Admin signs in (separate browser context) and sees the pending application.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(admin).toHaveURL(/\/admin$/);
  await expect(admin.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(admin.getByText('Pending sellers')).toBeVisible();

  await admin.getByRole('link', { name: 'Sellers' }).click();
  await admin.getByLabel('Search by store, business or email').fill(sellerEmail);
  await admin.getByRole('link', { name: storeName }).click();
  await expect(admin.getByText('Pending', { exact: true }).first()).toBeVisible();

  // 3. Rejecting requires a reason (validation), then approve instead.
  await admin.getByRole('button', { name: 'Reject' }).click();
  await admin.getByRole('button', { name: 'Reject application' }).click();
  await expect(admin.getByText(/give a reason/i)).toBeVisible();
  await admin.getByRole('button', { name: 'Cancel' }).click();

  await admin.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByText('Seller approved')).toBeVisible();
  await expect(admin.getByText('Approved', { exact: true }).first()).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Suspend' })).toBeVisible();

  // 4. The seller sees the new status and a notification.
  await page.reload();
  await expect(page.getByText(/you can now publish products/i).first()).toBeVisible();
  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.getByText('Your store has been approved')).toBeVisible();

  // 5. Role isolation: the seller cannot open the admin console.
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/seller$/);

  await adminCtx.close();
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('anonymous visitors are redirected to login for protected pages', async ({ page }) => {
  await page.goto('/admin/sellers');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('invalid login shows an inline error', async ({ page }) => {
  await signIn(page, 'nobody@e2e.local', 'WrongPass123');
  await expect(page.getByRole('alert')).toContainText('Invalid email or password');
});

test('mobile layout opens the portal drawer @responsive', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('link', { name: 'Sellers' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
