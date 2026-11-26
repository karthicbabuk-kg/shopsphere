import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, PASSWORD, createSellerWithLiveProduct, deliveredOrderViaApi, signIn } from './helpers';

const stampOf = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

test('seller sees sales and exports CSV; admin reviews the order, settles the payout and edits settings', async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  const stamp = stampOf();
  const seller = await createSellerWithLiveProduct(request, stamp, { price: 800, stock: 10 });
  const order = await deliveredOrderViaApi(request, seller, stamp, 2); // 2 x 800 = ₹1,600, free delivery

  // ── Seller: dashboard widget and reports ──
  await signIn(page, seller.email, PASSWORD);
  await expect(page).toHaveURL(/\/seller$/);
  await expect(page.getByRole('heading', { name: 'Sales, last 30 days' })).toBeVisible();
  await page.getByRole('link', { name: 'Reports' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  await expect(page.getByText('₹1,600').first()).toBeVisible();
  await expect(page.getByText('₹1,440').first()).toBeVisible(); // earnings: 1,600 less the 10% platform fee
  await expect(page.getByRole('img', { name: /Daily sales for the last 30 days, ₹1,600 in total/ })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Top items by sales' })).toContainText('E2E Order Gadget');
  await expect(page.getByText('Delivered, ready to settle')).toBeVisible();

  await page.getByRole('button', { name: 'Last 7 days' }).click();
  await expect(page.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export orders (CSV)' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^my-orders-\d{4}-\d{2}-\d{2}\.csv$/);
  const path = await download.path();
  const csv = (await import('node:fs')).readFileSync(path!, 'utf8');
  expect(csv).toContain(order.orderNo);
  expect(csv).toContain('1600.00');
  expect(csv).toContain('160.00'); // platform fee

  // ── Admin: order oversight ──
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.getByRole('link', { name: 'Orders', exact: true }).click();
  await admin.getByLabel('Search by order number').fill(order.orderNo);
  await admin.getByRole('link', { name: order.orderNo }).click();
  await expect(admin.getByText(`apibuyer-${stamp}@e2e.local`)).toBeVisible();
  await expect(admin.getByText('Commission (10%)')).toBeVisible();
  await expect(admin.getByText('₹160').first()).toBeVisible();

  // ── Admin: reports ──
  await admin.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  await expect(admin.getByRole('heading', { name: 'Inventory across all sellers' })).toBeVisible();
  await expect(admin.getByRole('img', { name: /Daily sales for the last 30 days/ })).toBeVisible();
  await expect(admin.getByRole('list', { name: 'Top sellers by sales' })).toBeVisible();

  // ── Admin: settle and pay out ──
  await admin.getByRole('link', { name: 'Settlements' }).click();
  await admin.getByRole('button', { name: `Create settlement for ${seller.storeName}` }).click();
  await expect(admin.getByRole('dialog')).toContainText('₹1,440');
  await admin.getByRole('dialog').getByRole('button', { name: 'Create settlement' }).click();
  await expect(admin.getByRole('button', { name: `Mark settlement for ${seller.storeName} as paid` })).toBeVisible();
  await expect(admin.getByRole('button', { name: `Create settlement for ${seller.storeName}` })).toHaveCount(0);
  await admin.getByRole('button', { name: `Mark settlement for ${seller.storeName} as paid` }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Mark paid' }).click();
  await expect(admin.getByRole('row', { name: new RegExp(seller.storeName) })).toContainText('Paid');

  // Seller sees the paid statement.
  await page.reload();
  await expect(page.getByRole('row', { name: /Paid/ })).toContainText('₹1,440');

  // ── Admin: settings (changed, validated, then restored) ──
  await admin.getByRole('link', { name: 'Settings' }).click();
  const reorder = admin.getByLabel('Default reorder level');
  await expect(reorder).not.toHaveValue(''); // wait for the stored values to load into the form
  const original = await reorder.inputValue();
  try {
    await reorder.fill('abc');
    await admin.getByRole('button', { name: 'Save settings' }).click();
    await expect(admin.getByText('Enter a number')).toBeVisible();
    await reorder.fill('9');
    await admin.getByLabel('Platform commission').fill('90');
    await admin.getByRole('button', { name: 'Save settings' }).click();
    await expect(admin.getByText('Value is outside the allowed range')).toBeVisible();
    await admin.getByLabel('Platform commission').fill('10');
    await admin.getByRole('button', { name: 'Save settings' }).click();
    await expect(admin.getByRole('button', { name: 'Save settings' })).toBeDisabled(); // saved, nothing pending
    await admin.reload();
    await expect(admin.getByLabel('Default reorder level')).toHaveValue('9');
  } finally {
    await admin.getByLabel('Default reorder level').fill(original);
    await admin.getByRole('button', { name: 'Save settings' }).click();
    // Saved: the button is disabled again once the stored value equals the form.
    await expect(admin.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  }
  await adminCtx.close();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('seller reports and admin pages fit a phone screen @responsive', async ({ page, request }) => {
  const stamp = stampOf();
  const seller = await createSellerWithLiveProduct(request, stamp, { price: 700, stock: 5 });
  await deliveredOrderViaApi(request, seller, stamp, 1);
  await signIn(page, seller.email, PASSWORD);
  await expect(page).toHaveURL(/\/seller$/);
  for (const path of ['/seller', '/seller/reports', '/seller/orders']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
});
