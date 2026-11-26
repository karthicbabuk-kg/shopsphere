import { expect, test, type Page } from '@playwright/test';
import { PASSWORD } from './helpers';

const stampOf = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function registerBuyerUI(page: Page, stamp: string) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('E2E Buyer');
  await page.getByLabel('Email').fill(`buyer-${stamp}@e2e.local`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('browse, search, filter and sort the catalogue as a guest', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Trending now' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New arrivals' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shop by category' })).toBeVisible();
  await expect(page.getByText('WELCOME10')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause slideshow' })).toBeVisible();

  // Autosuggest: products, categories and brands, keyboard friendly.
  const search = page.getByRole('combobox', { name: /Search products/ });
  await search.fill('pulse');
  const listbox = page.getByRole('listbox', { name: 'Search suggestions' });
  await expect(listbox.getByRole('option', { name: /Pulse Immerse Wireless ANC Headphones/ })).toBeVisible();
  await expect(listbox.getByRole('option', { name: /Pulse Audio/ })).toBeVisible();
  await search.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=pulse/);
  await expect(page.getByRole('heading', { level: 1, name: /Results for/ })).toBeVisible();
  const countText = page.locator('p[aria-live="polite"]');
  await expect(countText).toContainText('3 products');

  // Filters are reflected in the URL and the result count.
  await page.getByRole('checkbox', { name: /Kairo/ }).click();
  await expect(page).toHaveURL(/brand=kairo/);
  await expect(countText).toContainText('1 product');
  await expect(page.getByRole('button', { name: 'Remove filter Kairo' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove filter Kairo' }).click();
  await expect(countText).toContainText('3 products');

  // Sorting by price: lowest first.
  await page.getByLabel('Sort by').click();
  await page.getByRole('option', { name: 'Price: low to high' }).click();
  await expect(page).toHaveURL(/sort=price_asc/);
  await expect(page.getByRole('article').first()).toContainText('Kairo Pulse Band 2');

  // A search with no matches explains itself.
  await page.goto('/search?q=zzzzqqqq');
  await expect(page.getByText('No products found')).toBeVisible();

  // Category navigation with sub-categories and rating filter.
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Product categories' }).getByRole('link', { name: 'Electronics' }).first().click();
  await expect(page).toHaveURL(/\/c\/electronics$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Electronics' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Laptops' }).first()).toBeVisible();
  await page.getByRole('radio', { name: /4.*& above/ }).click();
  await expect(page).toHaveURL(/rating=4/);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('product page: gallery, options, stock hints and delivery estimate', async ({ page }) => {
  await page.goto('/p/pulse-immerse-anc-headphones');
  await expect(page.getByRole('heading', { level: 1, name: /Pulse Immerse/ })).toBeVisible();
  await expect(page.getByText('₹6,499').first()).toBeVisible();
  await expect(page.getByText('35% off')).toBeVisible();

  // Gallery thumbnails switch the main image; clicking opens the lightbox.
  await page.getByRole('button', { name: 'Show image 2 of 2' }).click();
  await expect(page.getByRole('img', { name: /image 2$/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /full size/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  // Scarce variant discloses the exact count and caps the quantity.
  await page.getByRole('button', { name: 'Ember Red' }).click();
  await expect(page.getByText('Only 3 left in stock')).toBeVisible();
  const plus = page.getByRole('button', { name: 'Increase quantity' });
  await plus.click();
  await plus.click();
  await expect(page.locator('output').first()).toHaveText('3');
  await expect(plus).toBeDisabled();

  // Out-of-stock variants cannot be bought.
  await page.goto('/p/kairo-fit-smart-watch');
  await page.getByRole('button', { name: /Graphite/ }).click();
  await expect(page.getByText('Currently out of stock')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to cart' }).first()).toBeDisabled();

  // Delivery estimate validates the PIN code.
  await page.getByPlaceholder('Enter PIN code').fill('600041');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText(/Delivery by/)).toBeVisible();
  await page.getByPlaceholder('Enter PIN code').fill('12');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Enter a valid 6-digit PIN code')).toBeVisible();

  // Tabs: specifications and reviews.
  await page.getByRole('tab', { name: 'Specifications' }).click();
  await expect(page.getByText('Water resistance')).toBeVisible();
  await page.getByRole('tab', { name: /Reviews/ }).click();
  await expect(page.getByRole('list', { name: 'Rating breakdown' })).toBeVisible();

  await page.goto('/p/does-not-exist');
  await expect(page.getByText('This product is not available')).toBeVisible();
});

test('guests are sent to sign in when they try to buy', async ({ page }) => {
  await page.goto('/p/kairo-pulse-band-2');
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('buyer journey: wishlist, cart quantities, totals, delivery rules and checkout hand-off', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const stamp = stampOf();
  await registerBuyerUI(page, stamp);

  // Wishlist from a product card: heart toggles optimistically and persists.
  await page.goto('/search?q=yoga');
  const card = page.getByRole('article').filter({ hasText: 'Yoga Mat' });
  await card.getByRole('button', { name: /Add .* to wishlist/ }).click();
  await expect(page.getByText('Saved to your wishlist')).toBeVisible();
  await expect(card.getByRole('button', { name: /Remove .* from wishlist/ })).toBeVisible();
  await page.goto('/wishlist');
  await expect(page.getByRole('heading', { name: /My wishlist/ })).toContainText('(1)');
  await page.getByRole('button', { name: /Remove .* from wishlist/ }).click();
  await expect(page.getByText('Nothing saved yet')).toBeVisible();

  // Cart: quantity 2 of a 1,499 band (MRP 2,999) from TechNest.
  await page.goto('/p/kairo-pulse-band-2');
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByText('2 items added to your cart')).toBeVisible();
  await expect(page.getByRole('button', { name: /Cart, 2 items/ })).toBeVisible();

  // A cheaper item from a different seller (below the free-delivery threshold).
  await page.goto('/p/pure-roots-aloe-moisturiser');
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByRole('button', { name: /Cart, 3 items/ })).toBeVisible();

  await page.getByRole('button', { name: /Cart, 3 items/ }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole('heading', { level: 1, name: /Shopping cart/ })).toContainText('3 items');
  await expect(page.getByText('Free delivery on this shipment')).toBeVisible();
  await expect(page.getByText(/add .*₹150.* more from this seller for free delivery/)).toBeVisible();

  const summary = page.getByRole('complementary', { name: 'Price details' });
  // 2 x 1,499 + 349 = 3,347; the second seller charges 49 delivery, so the total is 3,396.
  // MRP total: 2 x 2,999 + 499 = 6,497, a saving of 3,150.
  await expect(summary).toContainText('₹6,497');
  await expect(summary).toContainText('− ₹3,150');
  await expect(summary).toContainText('₹3,347');
  await expect(summary.getByText('₹49')).toBeVisible();
  await expect(summary.getByText('₹3,396')).toBeVisible();
  await expect(summary).toContainText('Includes ₹518.03 GST');

  // Changing quantity recalculates on the server.
  const bandLine = page.getByRole('listitem').filter({ hasText: 'Kairo Pulse Band 2' });
  await bandLine.getByRole('button', { name: 'Decrease quantity' }).click();
  await expect(summary.getByText('₹1,848')).toBeVisible();
  await bandLine.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(summary.getByText('₹3,347')).toBeVisible();

  // Remove the cheap item: only the free-delivery shipment remains.
  await page.getByRole('button', { name: /Remove\s*Pure Roots/ }).click();
  await expect(summary.getByText('Free', { exact: true })).toBeVisible();
  await expect(summary.getByText('₹2,998').first()).toBeVisible();

  await page.getByRole('button', { name: 'Proceed to checkout' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText(/is valid and ready/)).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('seller accounts are told cart and wishlist need a buyer account', async ({ page }) => {
  const stamp = stampOf();
  await page.goto('/seller/register');
  await page.getByLabel('Business name').fill(`E2E Traders ${stamp}`);
  await page.getByLabel('Store name').fill(`E2E Store ${stamp}`);
  await page.getByLabel('Your name').fill('E2E Seller');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('Email').fill(`seller-${stamp}@e2e.local`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page).toHaveURL(/\/seller$/);
  await page.goto('/p/kairo-pulse-band-2');
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByText(/available for buyer accounts/)).toBeVisible();
  await expect(page).toHaveURL(/\/p\/kairo-pulse-band-2$/);
});

test('mobile storefront: no horizontal overflow, filter drawer and purchase bar @responsive', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Trending now' })).toBeVisible();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(await overflow()).toBe(false);

  await page.goto('/c/fashion');
  await expect(page.getByRole('heading', { level: 1, name: 'Fashion' })).toBeVisible();
  await page.getByRole('button', { name: /Filters/ }).click();
  const drawer = page.getByRole('presentation').filter({ hasText: 'Customer rating' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('checkbox', { name: /In stock only/ }).click();
await expect(drawer.getByRole('checkbox', { name: /In stock only/ })).toBeChecked();
  await drawer.getByRole('button', { name: /Show .* results/ }).click();
  await expect(page).toHaveURL(/inStock=true/);
  expect(await overflow()).toBe(false);

  await page.goto('/p/stride-airlite-running-shoes');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buy now' }).last()).toBeVisible();
  expect(await overflow()).toBe(false);
});
