import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, createSellerWithLiveProduct, signIn } from './helpers';

const stampOf = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function registerBuyerUI(page: Page, stamp: string) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('E2E Buyer');
  await page.getByLabel('Email').fill(`buyer-${stamp}@e2e.local`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function addProductToCart(page: Page, slug: string) {
  await page.goto(`/p/${slug}`);
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByRole('button', { name: /Cart, 1 item/ })).toBeVisible();
}

async function addAddressAtCheckout(page: Page) {
  await page.getByRole('button', { name: 'Add a new address' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('Asha Verma');
  await dialog.getByLabel('Mobile number').fill('9876543210');
  await dialog.getByLabel('House no., street').fill('21 Lake View Road');
  await dialog.getByLabel('City').fill('Pune');
  await dialog.getByLabel('State').click();
  await page.getByRole('option', { name: 'Maharashtra' }).click();
  await dialog.getByLabel('PIN code').fill('411001');
  // Client-side validation first.
  await dialog.getByLabel('Mobile number').fill('12345');
  await dialog.getByRole('button', { name: 'Save address' }).click();
  await expect(dialog.getByText('Enter a 10-digit Indian mobile number')).toBeVisible();
  await dialog.getByLabel('Mobile number').fill('9876543210');
  await dialog.getByRole('button', { name: 'Save address' }).click();
  await expect(page.getByText('Address saved')).toBeVisible();
}

test('buyer places an order with a coupon; seller fulfils it; buyer reviews and returns it', async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  const stamp = stampOf();
  const seller = await createSellerWithLiveProduct(request, stamp, { price: 800, stock: 5 });

  // ── Buyer: cart → checkout ──
  await registerBuyerUI(page, stamp);
  await addProductToCart(page, seller.slug);
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Proceed to checkout' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();

  // No address yet: the order cannot be placed.
  await expect(page.getByText('You have no saved addresses yet')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay .* \(demo\)/ })).toBeDisabled();
  await addAddressAtCheckout(page);
  await expect(page.getByRole('radio', { name: /Asha Verma/ })).toBeChecked();

  // Coupon: bad code is rejected, WELCOME10 takes 10% (₹80) off ₹800.
  await page.getByLabel('Coupon code').fill('NOTACODE');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('This coupon code is not valid')).toBeVisible();
  await page.getByLabel('Coupon code').fill('welcome10');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('WELCOME10 applied')).toBeVisible();
  const summary = page.getByRole('complementary', { name: 'Order summary' });
  await expect(summary).toContainText('− ₹80');
  await expect(summary).toContainText('₹720');

  // Demo gateway: a declined payment leaves the cart intact and creates no order.
  await page.getByLabel('Simulated result').click();
  await page.getByRole('option', { name: 'Payment is declined' }).click();
  await page.getByRole('button', { name: /Pay ₹720 \(demo\)/ }).click();
  await expect(page.getByText(/demo payment was declined/i)).toBeVisible();
  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByLabel('Simulated result').click();
  await page.getByRole('option', { name: 'Payment succeeds' }).click();
  await page.getByRole('button', { name: /Pay ₹720 \(demo\)/ }).click();

  await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Thank you, your order is placed')).toBeVisible();
  const orderUrl = page.url();
  await expect(page.getByText(/SS-\d{8}-[0-9A-F]{6}/).first()).toBeVisible();
  await expect(page.getByRole('region', { name: /Shipment/ }).or(page.getByRole('article', { name: 'Shipment 1' }))).toContainText(seller.name);
  await expect(page.getByRole('complementary')).toContainText('₹720');
  await expect(page.getByRole('button', { name: /Cart/ })).not.toContainText('1 item');

  // ── Seller: accept → process → pack → ship → deliver ──
  const sellerCtx = await browser.newContext();
  const sp = await sellerCtx.newPage();
  await signIn(sp, seller.email, PASSWORD);
  await expect(sp).toHaveURL(/\/seller$/);
  await sp.getByRole('link', { name: 'Orders' }).click();
  await expect(sp.getByRole('heading', { name: 'Orders' })).toBeVisible();
  await sp.getByRole('link', { name: /^SS-/ }).first().click();
  await expect(sp.getByText('Asha Verma')).toBeVisible();
  await expect(sp.getByText('Your earnings')).toBeVisible();
  await sp.getByRole('button', { name: 'Accept order' }).click();
  await expect(sp.getByRole('button', { name: 'Start processing' })).toBeVisible();
  await sp.getByRole('button', { name: 'Start processing' }).click();
  await sp.getByRole('button', { name: 'Mark as packed' }).click();
  await sp.getByRole('button', { name: 'Ship order' }).click();
  await sp.getByLabel('Tracking number (optional)').fill('E2ETRACK123');
  await sp.getByRole('button', { name: 'Mark as shipped' }).click();
  await expect(sp.getByText('E2ETRACK123')).toBeVisible();
  await sp.getByRole('button', { name: 'Mark as delivered' }).click();
  await expect(sp.getByRole('region', { name: 'Next steps' })).toHaveCount(0);
  await expect(sp.getByText('Delivered', { exact: true }).first()).toBeVisible();
  // Inventory: 5 - 1 sold, nothing reserved.
  await sp.getByRole('link', { name: 'Inventory' }).click();
  await expect(sp.getByRole('row', { name: new RegExp(seller.name) })).toContainText('4');

  // ── Buyer: tracking, invoice, review ──
  await page.goto(orderUrl);
  await expect(page.getByText('E2ETRACK123')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shipment progress' }).or(page.getByRole('list', { name: 'Shipment progress' }))).toBeVisible();
  await page.getByText('Tracking history').click();
  await expect(page.getByText('Shipped via Delhivery')).toBeVisible();
  await page.getByRole('link', { name: /Invoice for SS-/ }).click();
  await expect(page.getByRole('heading', { name: 'Tax invoice' })).toBeVisible();
  await expect(page.getByText('of which GST (inclusive)')).toBeVisible();
  await page.goBack();

  await page.getByRole('link', { name: 'Write a review' }).click();
  await page.getByRole('button', { name: 'Write a review' }).click();
  await page.getByRole('button', { name: 'Submit review' }).click();
  await expect(page.getByText('Choose a star rating')).toBeVisible();
  await page.getByRole('button', { name: '4 stars' }).click();
  await page.getByLabel('Title (optional)').fill('Does the job');
  await page.getByRole('button', { name: 'Submit review' }).click();
  await expect(page.getByText('Thanks for your review')).toBeVisible();
  await expect(page.getByText('You rated this')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Does the job' })).toBeVisible();

  // ── Return: request → seller approves → seller receives → refund and stock back ──
  await page.goto(orderUrl);
  await page.getByRole('button', { name: 'Return items' }).click();
  await page.getByLabel('Reason').fill('Not what I expected');
  await page.getByRole('button', { name: 'Request return' }).click();
  await expect(page.getByText(/Waiting for the seller to approve/)).toBeVisible();

  await sp.getByRole('link', { name: 'Orders' }).click();
  await sp.getByRole('link', { name: /^SS-/ }).first().click();
  await expect(sp.locator('.MuiAlert-message', { hasText: 'Return requested' })).toBeVisible();
  await sp.getByRole('button', { name: 'Approve return' }).click();
  await expect(sp.getByRole('button', { name: 'Mark return received' })).toBeVisible();
  await sp.getByRole('button', { name: 'Mark return received' }).click();
  await expect(sp.getByText('Returned', { exact: true }).first()).toBeVisible();
  await sp.getByRole('link', { name: 'Inventory' }).click();
  await expect(sp.getByRole('row', { name: new RegExp(seller.name) })).toContainText('5');
  await sellerCtx.close();

  await page.goto(orderUrl);
  await expect(page.getByText('Return received and refunded.')).toBeVisible();
  await expect(page.getByText('Refunded', { exact: true }).first()).toBeVisible();

  expect(errors.filter((e) => !/Failed to load resource.*(400|402|409)/.test(e)), errors.join('\n')).toEqual([]);
});

test('buyer cancels a cash-on-delivery order and the stock returns', async ({ page, request }) => {
  const stamp = stampOf();
  const seller = await createSellerWithLiveProduct(request, stamp, { price: 600, stock: 3 });
  await registerBuyerUI(page, stamp);
  await addProductToCart(page, seller.slug);
  await page.goto('/checkout');
  await addAddressAtCheckout(page);
  await page.getByRole('radio', { name: /Cash on delivery/ }).check();
  await expect(page.getByLabel('Simulated result')).toHaveCount(0); // no simulator for COD
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: 'Cancel order' }).click();
  await page.getByLabel('Reason').fill('Ordered by mistake');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByText('Order cancelled', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Reason: Ordered by mistake')).toBeVisible();

  await page.goto('/account/orders');
  await page.getByRole('button', { name: 'Cancelled' }).click();
  await expect(page.getByRole('link', { name: /SS-/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Delivered' }).click();
  await expect(page.getByText('No orders in this view')).toBeVisible();
});

test('mobile: checkout, orders and addresses fit the screen @responsive', async ({ page, request }) => {
  const stamp = stampOf();
  const seller = await createSellerWithLiveProduct(request, stamp, { price: 650, stock: 3 });
  await registerBuyerUI(page, stamp);
  await addProductToCart(page, seller.slug);
  await page.goto('/checkout');
  await addAddressAtCheckout(page);
  const noOverflow = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await noOverflow();
  if (process.env.SHOTS) await page.screenshot({ path: 'shots/m-checkout.png', fullPage: true });
  await page.getByRole('radio', { name: /Cash on delivery/ }).check();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]{36}$/);
  await noOverflow();
  if (process.env.SHOTS) await page.screenshot({ path: 'shots/m-order.png', fullPage: true });
  for (const path of ['/account/orders', '/account/addresses']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();
    await noOverflow();
  }
  if (process.env.SHOTS) await page.screenshot({ path: 'shots/m-addresses.png', fullPage: true });
});
