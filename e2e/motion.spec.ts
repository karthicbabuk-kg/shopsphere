import { expect, test } from '@playwright/test';

const FADE = '.route-fade';

test('pages fade in after navigation but not on the first load', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Trending now' })).toBeVisible();
  // The first paint is never delayed by an animation.
  await expect(page.locator(FADE)).toHaveCount(0);

  await page.goto('/search?q=pulse'); // full load again: still no fade
  await expect(page.locator(FADE)).toHaveCount(0);

  // A client-side navigation does fade, with the shared easing and a short duration.
  await page.getByRole('link', { name: 'ShopSphere' }).first().click();
  await expect(page.getByRole('heading', { name: 'Trending now' })).toBeVisible();
  const style = await page.locator(FADE).evaluate((el) => {
    const s = getComputedStyle(el);
    return { name: s.animationName, duration: s.animationDuration };
  });
  expect(style.name).toBe('route-in');
  expect(parseFloat(style.duration)).toBeLessThanOrEqual(0.3);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('no slideshow animation or controls on the home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Trending now' })).toBeVisible();
    // The hero slide does not animate, and the slideshow does not auto-advance, so it has no play/pause control.
    await expect(page.locator('.slide-in').first()).toBeVisible();
    await expect.poll(() => page.locator('.slide-in').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await expect(page.getByRole('button', { name: /slideshow/i })).toHaveCount(0);
  });

  test('page changes do not animate', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Trending now' })).toBeVisible();
    await page.locator('header nav a[href^="/c/"]:visible').first().click();
    await expect(page).toHaveURL(/\/c\//);
    await expect(page.locator(FADE)).toHaveCount(1);
    // Poll: styles can settle a moment after the element appears.
    await expect.poll(() => page.locator(FADE).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});

test('moving to a new page starts at the top; going back restores where you were', async ({ page }) => {
  await page.goto('/search?q=a');
  await expect(page.getByRole('heading', { level: 1, name: /Results for/ })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(500);

  // Click a card that is already on screen at this scroll position (like a visitor), without letting
  // Playwright scroll the page first.
  const target = await page.locator('article').evaluateAll((els) => {
    const el = els.find((e) => e.getBoundingClientRect().top > 100 && e.getBoundingClientRect().top + 60 < window.innerHeight - 20)!;
    const r = el.getBoundingClientRect();
    return { x: r.left + 60, y: r.top + 60 };
  });
  await page.mouse.click(target.x, target.y);
  await expect(page.getByRole('button', { name: 'Add to cart' }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeLessThan(40);

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: /Results for/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(400);
});

test('pointing at a product card starts loading its page before the click', async ({ page }) => {
  await page.goto('/search?q=pulse');
  const card = page.locator('article').first();
  await expect(card).toBeVisible();
  const request = page.waitForRequest((r) => /\/api\/v1\/products\/[^/?]+(\?|$)/.test(r.url()) && !r.url().includes('/reviews'));
  await card.hover({ position: { x: 60, y: 60 } });
  await request; // fired by the hover, not by a click
  await card.click({ position: { x: 60, y: 60 } });
  await expect(page.getByRole('button', { name: 'Add to cart' }).first()).toBeVisible();
});
