import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, PASSWORD, createSellerWithLiveProduct, deliveredOrderViaApi, scrollThrough, signIn } from './helpers';

const stampOf = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** WCAG 2.0/2.1 A and AA rules. Any violation (not just serious ones) fails the test. */
async function scan(page: Page, label: string) {
  // Let route chunks, queries and fonts settle so the scan sees the real page.
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n    ')}`);
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([]);
}

test('public pages have no accessibility violations', async ({ page }) => {
  for (const [path, ready] of [
    ['/', 'Trending now'],
    ['/search?q=pulse', 'Results for'],
    ['/c/electronics', 'Electronics'],
    ['/p/kairo-pulse-band-2', 'Kairo Pulse Band 2'],
    ['/login', 'Sign in'],
    ['/register', 'Create'],
    ['/seller/register', 'store'],
    ['/forgot-password', 'password'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByText(ready, { exact: false }).first()).toBeVisible();
    if (path === '/') await scrollThrough(page);
    await scan(page, path);
  }
});

test('buyer pages have no accessibility violations', async ({ page, request }) => {
  test.setTimeout(120_000);
  const stamp = stampOf();
  const seller = await createSellerWithLiveProduct(request, stamp, { price: 800, stock: 10 });
  const order = await deliveredOrderViaApi(request, seller, stamp, 1);
  await signIn(page, `apibuyer-${stamp}@e2e.local`, PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  // Cart with an item and the checkout with an address and coupons visible.
  await page.goto(`/p/${seller.slug}`);
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByRole('button', { name: /Cart, 1 item/ })).toBeVisible();
  await page.goto('/cart');
  await expect(page.getByRole('heading', { level: 1, name: /Shopping cart/ })).toBeVisible();
  await scan(page, '/cart');
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
  await scan(page, '/checkout');

  await page.goto('/wishlist');
  await expect(page.getByRole('heading', { name: /My wishlist/ })).toBeVisible();
  await scan(page, '/wishlist');
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
  await scan(page, '/account');
  await page.goto('/account/addresses');
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
  await scan(page, '/account/addresses');
  await page.getByRole('button', { name: 'Add address' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await scan(page, 'address dialog');
  await page.keyboard.press('Escape');
  await page.goto('/account/orders');
  await expect(page.getByRole('link', { name: new RegExp(order.orderNo) })).toBeVisible();
  await scan(page, '/account/orders');
  await page.getByRole('link', { name: new RegExp(order.orderNo) }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Order/ })).toBeVisible();
  await scan(page, 'order detail');
  await page.getByRole('link', { name: /Invoice for/ }).click();
  await expect(page.getByRole('heading', { name: 'Tax invoice' })).toBeVisible();
  await scan(page, 'invoice');
});

test('seller pages have no accessibility violations', async ({ page, request }) => {
  test.setTimeout(120_000);
  const stamp = stampOf();
  const seller = await createSellerWithLiveProduct(request, stamp, { price: 800, stock: 10 });
  await deliveredOrderViaApi(request, seller, stamp, 1);
  await signIn(page, seller.email, PASSWORD);
  await expect(page).toHaveURL(/\/seller$/);
  await expect(page.getByRole('heading', { name: 'Sales, last 30 days' })).toBeVisible();
  await scan(page, '/seller');
  for (const [path, heading] of [
    ['/seller/products', 'Products'],
    ['/seller/products/new', 'New product'],
    ['/seller/orders', 'Orders'],
    ['/seller/inventory', 'Inventory'],
    ['/seller/reports', 'Reports'],
    ['/seller/store', 'Store'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(heading) }).first()).toBeVisible();
    await scan(page, path);
  }
  await page.goto('/seller/orders');
  await page.getByRole('link', { name: /^SS-/ }).first().click();
  await expect(page.getByText('Ship to')).toBeVisible();
  await scan(page, 'seller order detail');
});

test('admin pages have no accessibility violations', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);
  await scan(page, '/admin');
  for (const [path, heading] of [
    ['/admin/sellers', 'Sellers'],
    ['/admin/products', 'Products'],
    ['/admin/catalog', 'Catalogue'],
    ['/admin/orders', 'Orders'],
    ['/admin/reports', 'Reports'],
    ['/admin/settlements', 'Settlements'],
    ['/admin/settings', 'Settings'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(heading) }).first()).toBeVisible();
    await scan(page, path);
  }
});
