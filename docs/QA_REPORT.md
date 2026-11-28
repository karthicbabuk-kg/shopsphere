# QA Report (Phase 10)

Measured on 2026-11-27 against the local stack (Node 22, PostgreSQL 16 in Docker). Nothing here is estimated; commands to reproduce are listed.

## Automated checks
| Check | Command | Result |
|---|---|---|
| Types | `pnpm typecheck` | clean |
| Lint | `pnpm lint` | clean |
| API tests | `pnpm --filter @shopsphere/api test` (test DB) | 156 passed in 11 files |
| Web unit tests | `pnpm --filter @shopsphere/web test` | 13 passed |
| Browser tests | `pnpm e2e` (Chromium, desktop and Pixel 7) | 23 passed, 1 skipped (the "uploads are not configured" test, which only applies when Cloudinary credentials are absent) |
| Accessibility | axe-core (WCAG 2.0/2.1 A and AA) over public, buyer, seller and admin pages including dialogs, invoice and order detail | 0 violations (`e2e/a11y.spec.ts`) |
| Dependencies | `pnpm audit` | no known vulnerabilities |

## What was added or fixed in this phase
- **Security**: `DEMO_MODE` defaults off in production; dedicated rate limits for orders, coupon quotes and reviews; web security headers and CSP; a patched `effect` pin; an automated authorization matrix over all 79 protected routes plus forged-token, privilege-escalation, enumeration, CORS, malformed/oversized body and injection-payload tests. Details in `SECURITY.md`.
- **Accessibility**: contrast-corrected colour tokens, labels that contain their visible text on icon buttons, a chart that no longer exposes a focusable hidden element, 24px touch targets on carousel dots.
- **Performance**: removed Framer Motion (first-load JS 483 kB to 341 kB, 155 to 106 kB gzipped), charts load only when shown, below-the-fold home rails render on demand, product-page loading skeleton mirrors the real layout, static HTML shell and Cloudinary preconnect, `robots.txt`.
- **Test reliability**: Vite pre-scans every lazy page (the cause of the occasional first-run reload failures), CI retries once, a CI workflow runs every check above.

## Lighthouse (production build served by `vite preview`, local API)
Mobile preset (simulated slow 4G, 4x CPU slowdown):

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| Home | 53 | 100 | 100 | 100 | 2.8 s | 4.3 s | 1.9 s | 0.03 |
| Search | 62 | 98 | 100 | 100 | 3.2 s | 4.4 s | 0.65 s | 0 |
| Product | 64 | 100 | 100 | 100 | 3.2 s | 4.5 s | 0.53 s | 0 |
| Login | 71 | 100 | 100 | 63* | 3.2 s | 4.0 s | 0.41 s | 0 |

Desktop preset: Home 90, Product 94, Search 98 (LCP about 1.0 s, TBT under 250 ms).

\* Login's SEO score is intentionally lower: `/login` is disallowed in `robots.txt` because it should not be indexed.

Before this phase the mobile scores were Home 49, Search 55, Product 38 (CLS 0.32), Login 58.

**Honest reading of the mobile numbers.** The remaining cost is the single-page-app baseline (React, MUI with Emotion, router and data layer run on a throttled CPU before anything is drawn). A local `vite preview` also has no CDN, HTTP/2 or edge caching, so the deployed site on Cloudflare Pages should score higher, but that has not been measured yet and is re-checked in Phase 11. Further gains would require server-side rendering or pre-rendering the public pages, which is out of scope for this demo.

## Manual checks performed
- Keyboard-only flow through checkout, dialogs close on Escape, focus returns to the trigger.
- Mobile layouts (Pixel 7 profile) for storefront, checkout, orders, addresses, seller and admin pages: no horizontal overflow.
- Reduced-motion preference stops the hero slideshow animation and auto-advance.

## Not covered
- Real-browser testing beyond Chromium (Firefox and Safari were not run).
- Screen-reader walkthroughs with NVDA or VoiceOver (axe finds rule violations, not every usability problem).
- Load testing; the oversell and idempotency races are tested with concurrent requests, not at volume.
- Live deployment checks (Phase 11).


## Live deployment checks (Phase 11, 2026-11-27)
Site: https://shopsphere.karthicbabu333.workers.dev (Cloudflare Workers static assets + /api proxy) -> Render (Singapore, free) -> Neon (Singapore, PostgreSQL 18).

| Check | Result |
|---|---|
| Home, deep links (/p/..., /account/orders), unknown API route | 200 / 200 / 404 as designed |
| Health and product list through the proxy | ok, database up |
| Login sets the refresh cookie (HttpOnly, Secure, SameSite=Lax) and /auth/refresh works from the cookie alone | yes |
| Real browser (Chromium desktop and Pixel 7 profile): sign in, reload, still signed in; add to cart, reload cart | yes, no console errors |
| Full business cycle through the live stack: register, address, coupon quote, UPI order, seller accept/process/pack/ship/deliver, review, return request/approve/receive, refund, admin report/orders/settings | all steps passed (18 s); test data then removed and stock, ratings and coupon counters verified restored |
| Security headers and CSP on the live site | present; browser CSP violations: none (after fixing a Zod eval probe) |

Lighthouse on the live site (mobile = simulated slow 4G with 4x CPU slowdown):

| Page | Mobile perf | Desktop perf | Accessibility | Best practices | SEO |
|---|---|---|---|---|---|
| Home | 41 | 91 | 100 | 100 | 100 |
| Search | 48 | 74 | 98 | 100 | 100 |
| Product | 45 | 71 to 83 | 100 | 100 | 100 |

Honest reading: the live mobile numbers are lower than the local-preview numbers earlier in this report (53 to 64), not higher as hoped. The cost is JavaScript execution on a throttled CPU before the first content can render (LCP render delay about 5 s), plus a fetch for the page data after the script loads. Lab scores also vary between runs (the figures above are single runs; Lighthouse sometimes fails to record a trace and has to be retried). Real devices on normal connections will feel faster than the throttled lab. Meaningful improvement would need server-side rendering or pre-rendering the public pages.

## Cold start of the free API (measured, 2026-11-28)
Render's free instance sleeps after about 15 idle minutes. This was tested properly because the first attempts failed:

| Finding | Evidence |
|---|---|
| A request sent **directly** to Render wakes it and is held until ready | direct request after idle: 200 after 21.7 s and 56.0 s (process uptime 12 to 13 s) |
| A request relayed by the Cloudflare Worker does **not** wake it | Render answered the Worker with 502 and `x-render-routing: no-deploy` immediately; three overnight tests and a second test after a code change all stayed unavailable for the full 4 minutes (diagnostics were added to the Worker's error to see this) |
| A bug of mine hid the first fix | the wake endpoint was mounted at `/api/v1/health/ping` while every client used `/api/v1/ping`; fixed by one shared `PING_PATH` constant used by the API, proxy, browser and all tests |
| Fix verified on the live site | after 18 idle minutes, a browser with a saved signed-in session: banner visible at 4 s, browser wake request to Render at 10.5 s, page rendered and **still signed in at 37 s**, second reload still signed in |

Design that resulted: the Worker gives up after about 10 s with `API_UNAVAILABLE` plus the wake address; the browser requests that address directly (an image request, allowed by the CSP), keeps the "demo server is waking up" notice on, retries every 8 s for up to about 2 minutes, and never treats a sleeping server as a signed-out user. Only one successful post-fix cold run was recorded; Render's boot time varies (21 to 56 s direct), so plan for up to a minute.

## Smoothness pass (measured, production build, CPU slowed 4x, five fresh browsers per number, medians)
| Measure | Before | After |
|---|---|---|
| Layout shift while navigating (home to product to listing to product) | 0.277 | **0** |
| Home to product page, after pointing at the card for 0.5 s | 1.39 s | 1.16 s (about 17% faster) |
| Listing to product page, after pointing at the card for 0.5 s | 0.58 s | 0.45 s (about 23% faster) |
| Longest blocking task during these navigations | 342 ms | 235 ms |
| Product to category listing | 0.15 s | 0.15 s (already fast) |

What caused the layout shift: the long home page was replaced by a short loading placeholder, the browser clamped the scroll position and the footer jumped into view (0.216); the placeholder was also shorter than the real page (0.06). Fixed by scrolling to the top on navigation and sizing the placeholder like the real page.

A first attempt preloaded pages in the background after load. It made the first load slower (blocking time on search 650 to 1,580 ms), so it was replaced by intent-based loading (on hover, focus or touch) plus a single very late idle fetch. Lighthouse after the final version is within its run-to-run noise (the product page scored between 42 and 63 across four identical runs), and layout shift is 0.

Clicks without any hover, and the very first product page render, are still CPU-bound under the artificial slowdown. On a normal machine they are a fraction of these figures.
