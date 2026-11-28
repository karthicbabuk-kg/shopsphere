# CLAUDE.md – ShopSphere

Multi-vendor e-commerce demo (buyer / seller / admin). Read `docs/PROJECT_OVERVIEW.md` for the roadmap, `docs/ARCHITECTURE.md` and `docs/DATABASE.md` before changing structure.

## Commands (run from repo root; pnpm only)
- `pnpm db:up` – start local Postgres (Docker, **host port 5433**; a Windows Postgres already uses 5432)
- `pnpm dev` – API (:4000) + web (:5173, proxies `/api`)
- `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
- Migrations: `pnpm db:migrate -- --name <name>` (dev), `pnpm --filter @shopsphere/api prisma:deploy` (prod/test)
- Test DB migrate: set `DATABASE_URL=$TEST_DATABASE_URL` then `prisma:deploy`
- Regenerate client: `pnpm --filter @shopsphere/api prisma:generate` (output `apps/api/src/generated/prisma`, git-ignored; run after every fresh clone)

## Layout
`apps/api` Express+Prisma · `apps/web` Vite+React · `packages/shared-*` · `prisma/` schema + migrations (config in `apps/api/prisma.config.ts`).

## Rules
- Money = integer paise. Never floats. Never trust price/stock from the client.
- Seller scoping always from the authenticated token, never request body.
- Inventory changes only through the inventory service; `stock_movements` is append-only (DB trigger); `available/reserved/sold` have CHECK >= 0.
- Business logic in services, not routes. Zod validation at every boundary; standard `{success,data|error}` responses.
- Never log passwords/tokens. No secrets in frontend. `.env` is git-ignored.
- Design tokens/components: `docs/DESIGN_SYSTEM.md`. No default browser alerts.

## Version notes (pinned deliberately)
- TypeScript **5.9** (typescript-eslint does not support TS 7 yet).
- Prisma **7**: needs `@prisma/adapter-pg`; datasource URL lives in `prisma.config.ts`; scripts load `../../.env` via `node --env-file`.
- Vite 8 (Rolldown): `manualChunks` object form unsupported; rely on route-level lazy loading.
- pnpm 12: build scripts are allowed via `allowBuilds` in `pnpm-workspace.yaml`.
- Tailwind 4 (`@theme` tokens in `apps/web/src/index.css`), MUI 9, React 19, Express 5, Zod 4.
- Bash tool: very long heredoc scripts can fail to parse; write files with the Write tool.
- PowerShell: `R` is an alias for Invoke-History; do not name helpers with built-in aliases.

## Status
All 12 phases done (plus a smoothness pass: no Ubuntu theme, no Ubuntu deployment, by the owner's decision). Live: https://shopsphere.karthicbabu333.workers.dev (Cloudflare Worker + Render API + Neon). Not yet exercised: .github/workflows/ci.yml on GitHub. Next steps are optional hardening (server-side rendering for mobile performance, swagger coverage, multi-instance rate limiting).

## Gotchas
- `.env` values containing `#` are truncated by Node's env loader (treated as comment).
- API production build: `pnpm --filter @shopsphere/api build` bundles with esbuild (apps/api/scripts/build.mjs): workspace packages are bundled in, npm dependencies stay external. Run with `node apps/api/dist/server.js`.
- Web keeps a non-secret `ss_session` localStorage hint so anonymous visitors skip the refresh call.
- Seller suspension promises hidden products: the Phase 7 storefront queries MUST filter on `seller.status = APPROVED` as well as product approval.
- E2E: `pnpm e2e` (Playwright, reuses running dev servers, tears down `@e2e.local` users). Tests live in `e2e/`.
- react-hook-form `useFieldArray` reserves the key `id`; never use `id` as a field name inside field arrays (use e.g. `variantId`).
- Product form works in rupees and converts to paise with `toPaise` at submit; the API only accepts integer paise.
- Seed (`pnpm db:seed`) creates the admin plus 27 categories / 20 brands. Test DB needs the same seed (`DATABASE_URL=$TEST_DATABASE_URL`).
- Auth rate limit (30/15 min) applies in production only; dev/test are unlimited.
- API tests mock Cloudinary and blank its credentials; E2E uses the real account from `.env` and deletes its uploads in teardown.
- Inventory: never UPDATE `inventories` directly; use `applyChange` / `reserveStock` / `releaseStock` / `commitSale` / `restockReturn` (see docs/BUSINESS_LOGIC.md). Order code (Phase 8) must call them inside its transaction.
- Tests and E2E cleanup delete stock rows by temporarily disabling the immutability trigger inside a transaction; production code never does.

- Demo data: `pnpm db:seed` then `pnpm --filter @shopsphere/api demo:seed`. Product images are generated illustrations (`apps/api/scripts/`), URLs in `demo-images.json`. Test DB needs `db:seed` only.
- Storefront visibility has ONE definition, `visibleProduct`; reuse it for anything buyer-facing.
- Money in the UI uses sans tabular numerals (DM Mono spaces out digit groups); `formatINR` drops ".00" for whole rupees.
- Cart/wishlist need a BUYER account; sellers and admins get an explanatory toast.
- Orders: every status change goes through `move()` in `modules/orders/orders.service.ts` (compare-and-set plus stock, refund and commission effects); the parent order status is derived by `deriveOrderStatus`. Payments are simulated (no card data anywhere).
- The toaster shows messages one at a time; E2E tests must assert visible state, not queued toasts.
- Public GETs are browser-cached for 30 s; after a buyer edits something shown there call `bustPublicCache()` (storeApi.ts).
- E2E order tests create their own seller and product (`createSellerWithLiveProduct`) so demo stock is untouched; teardown also removes orders and reviews and recounts coupon usage.
- Report definitions live in `modules/reports/reports.service.ts` (sales excludes CANCELLED/RETURNED; sales = commission + net + delivery). Charts use recharts via `components/charts/Charts.tsx` with a hidden data table for screen readers. CSV cells go through `utils/csv.ts` (formula-injection safe); never build CSV by hand.
- E2E tests that change platform settings must wait for the form to load before reading values and must restore them.
- Security rules live in `docs/SECURITY.md`; `security.test.ts` walks the route table, so register new routers in its GROUPS list. New write endpoints that cost something or can be guessed at need a limiter from `middleware/limiters.ts`.
- Accessibility is enforced by `e2e/a11y.spec.ts` (axe). Text colours must come from the tokens (contrast-checked); icon buttons need an accessible name that contains any visible text.
- Below-the-fold home sections use `<Deferred>`; E2E tests must `scrollThrough(page)` before looking for them.
- Lighthouse: build the web app, run `vite preview` (4173) and point Lighthouse at it; use Chromium from the Playwright cache via CHROME_PATH.
- Deployment: render.yaml (API, free plan, builds and migrates), Cloudflare Workers project (root dir apps/web, wrangler.jsonc, worker/index.ts proxies /api/* to Render) so the refresh cookie is first-party. The dashboard flow creates Workers projects, not Pages; there is no _redirects file (SPA fallback is in wrangler.jsonc). The API sleeps when idle; the web shows a waking-up banner (store/slowApi.ts). A Worker-relayed request does NOT wake a sleeping Render service (it gets 502 x-render-routing: no-deploy); the browser wakes it with an image request to /api/v1/ping (see services/api.ts, docs/DEPLOYMENT.md). An optional keep-alive pinger must use /api/v1/ping, never /health (health queries the database and burns Neon compute hours).
- Heredocs containing apostrophes or long text fail in the Bash tool; use the Write tool for files.
- Neon CLI: `neon deploy` and `neon env pull` overwrite DATABASE_URL in .env (pointing local dev at Neon). Pull into the git-ignored file instead: `neon env pull --file .env.neon --services postgres`. Neon project: flat-recipe-33154396 (aws-ap-southeast-1, Postgres 18, branch production); the schema and demo data are already applied there.
- The pnpm override for effect MUST stay on the 3.x line (^3.22.1): effect 4 breaks the Prisma CLI config loader (migrate fails with a TypeError).
- Neon connection strings use sslmode=require; pg prints a harmless warning about it. Use sslmode=verify-full in Render env vars to keep today's behaviour and silence it.
- Smoothness: page changes fade via RouteFade and use router ScrollRestoration, so pages must NOT call window.scrollTo on mount (it breaks Back restoring the position). Links preload their page on hover/focus/touch (preloadForPath, register new heavy pages with the preload option in app/router.tsx); never preload at page load (it slowed first load). All motion is opacity/transform only and disabled for reduced motion (see docs/DESIGN_SYSTEM.md, e2e/motion.spec.ts).
- E2E lessons: locator.evaluate on a missing element waits for the whole test timeout (assert existence first); Playwright scrolls elements into view before clicking, which can change the scroll position you are testing; avoid a[href^="/c/"] style selectors that also match hidden menu items.
