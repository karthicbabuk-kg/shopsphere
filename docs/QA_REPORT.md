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
