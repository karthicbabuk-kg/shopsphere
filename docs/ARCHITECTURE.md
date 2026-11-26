# ShopSphere Architecture

Modular monolith: one React SPA (role-based routes) + one Express API + one PostgreSQL database.

```
Browser (React SPA, Cloudflare Pages)
   │  HTTPS, JSON, httpOnly refresh cookie + Bearer access token
   ▼
Express API /api/v1 (Render free web service)
   ├─ middleware: helmet, cors, rate-limit, request-id, pino logger, auth, rbac, validate (Zod), error handler
   ├─ modules/*  (routes → controller → service → repository(Prisma))
   ├─ Prisma ──► PostgreSQL (Docker locally, Neon in prod)
   └─ Cloudinary (signed uploads; images never stored on API disk)
```

## Repository layout
As specified in the brief (`apps/web`, `apps/api`, `packages/shared-{types,validation,config}`, `prisma/`, `docs/`, `scripts/`). Zod schemas live in `shared-validation` and are used by both API validators and web forms. The Prisma schema sits at `prisma/schema.prisma` (root, shared).

## Backend layering
- **Routes**: path + middleware + controller binding only.
- **Controllers**: parse validated input, call service, shape the standard response `{ success, data, meta?, error? }`.
- **Services**: business rules and transactions (orders, inventory, commissions).
- **Repositories**: Prisma queries; use `select`/`include` deliberately to avoid N+1.
- **Errors**: `AppError(code, status, details)`; one central handler; no stack traces to clients in production.

## Key technical decisions
| Topic | Decision |
|---|---|
| Money | integer paise (`Int`/`BigInt`); percent maths with integer rounding helper (`round half up`) in `utils/money.ts` |
| Auth | 15-min JWT access token (memory only) + 7-day rotating refresh token, stored hashed in `user_sessions`, httpOnly+Secure+SameSite cookie; reuse of a rotated token revokes the whole session family; lockout after 5 failed logins (15 min) |
| RBAC | roles `BUYER`, `SELLER`, `ADMIN`; `requireRole()` plus `assertSellerOwnership()` in services; every seller query is scoped by `sellerId` from the token, never from the request body |
| Inventory | `inventories` row per variant; atomic conditional updates (`UPDATE … SET available = available - $q WHERE available >= $q`) inside the order transaction; every change writes an append-only `stock_movements` row (DB trigger blocks UPDATE/DELETE); `CHECK (available >= 0)` |
| Stock lifecycle | order placed → reserve (available↓, reserved↑) → seller ships → reserved↓, sold↑ → cancel before ship → release → return received → restock |
| Order creation | one transaction: re-price from DB, validate coupon, lock/decrement stock, create parent order, seller_orders, order_items (snapshots), payment, commissions, status history; idempotency key table prevents duplicates |
| Status machine | explicit transition map per entity; invalid transitions → 409; parent order status derived from child seller orders |
| Uploads | Multer memory storage (size/type limits, magic-byte check) → Cloudinary; store `publicId` + URL |
| Caching | none by default; short in-memory cache for categories/settings only |
| Logging | pino JSON, redaction of `authorization`, `password`, `token`, cookies |
| Docs | OpenAPI served at `/api/docs` (zod-to-openapi) |
| Testing | Vitest (unit), Supertest against a `shopsphere_test` DB (integration, includes concurrent-stock test), Playwright (E2E demo flow) |

## Frontend structure
`app/` (providers, router, theme) · `layouts/` (StorefrontLayout, SellerLayout, AdminLayout) · `pages/{storefront,buyer,seller,admin}` · `features/` (auth, cart, catalog, inventory, orders…, each with api hooks + components) · `services/` (axios client with refresh interceptor) · `store/` (small Zustand store for auth/cart UI; server state in TanStack Query) · route-level `React.lazy` code splitting, role guards, scroll restoration, `_redirects` SPA fallback on Cloudflare Pages.

## Environments
| | Local | Production |
|---|---|---|
| DB | Docker Desktop `postgres:16-alpine` | Neon (pooled URL for app, direct URL for migrations) |
| API | `pnpm dev` (tsx watch) | Render, `/health` check |
| Web | Vite dev, proxy `/api` | Cloudflare Pages |
| Images | Cloudinary (dev folder) | Cloudinary |

## Versions (pinned at Phase 2 after `pnpm view` checks)
Node 22 LTS · pnpm 9/10 · React 18/19 · Vite 6+ · TypeScript 5.x · Prisma 6.x · Express 4/5 · MUI 6/7 · Tailwind 3.4/4 · Postgres 16. Exact numbers recorded in README once installed.
