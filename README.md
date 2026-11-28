# ShopSphere

Premium multi-vendor e-commerce and inventory management demo: a buyer storefront, a seller portal and a super-admin portal on one Express API and one PostgreSQL database. Payments are simulated; no real money moves, and no card or UPI details are ever collected.

**Live demo:** https://shopsphere.karthicbabu333.workers.dev (free hosting: the first visit after a quiet period can take up to a couple of minutes while the API wakes up; the page says so). Logins and a guided tour are in [`docs/DEMO_GUIDE.md`](docs/DEMO_GUIDE.md).

> Status: all 12 build phases are complete. Checks at the last full run: 156 API tests, 27+ web unit tests, 23 browser tests including automated accessibility scans, no known dependency vulnerabilities. See [`docs/QA_REPORT.md`](docs/QA_REPORT.md) for measured results and limits.

## What it does
- **Buyers:** browse and search a catalogue (filters, sorting, autosuggest), wishlist, cart split by seller, address book, coupons, simulated UPI / card / cash-on-delivery checkout, multi-seller orders with tracking, cancellation, returns within 7 days, invoices, reviews.
- **Sellers:** apply and get approved, manage products and variants with Cloudinary images, inventory with an append-only stock ledger, stock counts and alerts, fulfil orders (accept, pack, ship, deliver), handle returns, sales and earnings reports with CSV export, settlement statements.
- **Admins:** approve sellers and products, manage categories and brands, see every order, platform reports and charts, create settlements, edit business settings (commission, GST, delivery fee), full audit trail.
- **Rules the code enforces:** money is integer paise everywhere; prices and stock are never trusted from the client; stock can never go negative or oversell under concurrency; every status change is a validated transition; sellers only ever see their own data.

## Stack
React 19 · TypeScript 5.9 · Vite 8 · Tailwind 4 · MUI 9 · TanStack Query · React Hook Form + Zod · Recharts · Lucide  
Node 22 · Express 5 · Prisma 7 · PostgreSQL · Zod 4 · JWT with rotating refresh tokens · Pino · Vitest · Supertest · Playwright · axe-core

Hosting used for the live demo: Neon (PostgreSQL) + Render (API) + Cloudflare (website and `/api` proxy) + Cloudinary (images), all on free plans. An Ubuntu self-hosting guide is also included.

## Quick start (Windows/macOS/Linux)
Prerequisites: Node 22+, pnpm 12, Docker Desktop.

```bash
pnpm install
cp .env.example .env        # then set real random secrets/passwords
pnpm db:up                  # Postgres in Docker on localhost:5433
pnpm --filter @shopsphere/api prisma:generate
pnpm db:migrate             # apply Prisma migrations
pnpm db:seed                # admin, categories, brands
pnpm --filter @shopsphere/api demo:seed   # demo sellers, buyers, 39 products
pnpm dev                    # API http://localhost:4000, web http://localhost:5173
```

- API docs: http://localhost:4000/api/docs (covers the early modules; the full endpoint list is in `docs/API_SPECIFICATION.md`) · health: http://localhost:4000/api/v1/health
- Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, browser tests: `pnpm e2e`

If port 5433 is taken, change `POSTGRES_PORT` and the ports in `DATABASE_URL`/`TEST_DATABASE_URL`.

## Documentation
| Topic | File |
|---|---|
| Guided demo, accounts, acceptance checklist | [`docs/DEMO_GUIDE.md`](docs/DEMO_GUIDE.md), [`docs/DEMO_CREDENTIALS.md`](docs/DEMO_CREDENTIALS.md) |
| Architecture, database, business rules | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DATABASE.md`](docs/DATABASE.md), [`docs/BUSINESS_LOGIC.md`](docs/BUSINESS_LOGIC.md) |
| API reference | [`docs/API_SPECIFICATION.md`](docs/API_SPECIFICATION.md) |
| Design | [`docs/REFERENCE_DESIGN_ANALYSIS.md`](docs/REFERENCE_DESIGN_ANALYSIS.md), [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md), [`docs/UX_GUIDELINES.md`](docs/UX_GUIDELINES.md) |
| Security and quality | [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/TESTING.md`](docs/TESTING.md), [`docs/QA_REPORT.md`](docs/QA_REPORT.md) |
| Deploying | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) (free cloud), [`docs/FREE_HOSTING_COMPARISON.md`](docs/FREE_HOSTING_COMPARISON.md), [`docs/UBUNTU_DEPLOYMENT.md`](docs/UBUNTU_DEPLOYMENT.md) (own server), [`docs/ENVIRONMENT_VARIABLES.md`](docs/ENVIRONMENT_VARIABLES.md) |
| Roadmap and history | [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) |

## Everything here is fictional
Brands, sellers, buyers and products are made up, product images are generated illustrations, and all payments, refunds and payouts are simulated bookkeeping.
