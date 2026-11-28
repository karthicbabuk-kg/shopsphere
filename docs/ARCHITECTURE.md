# ShopSphere Architecture

Modular monolith: one React SPA (role-based routes) + one Express API + one PostgreSQL database.

```
Browser (React SPA)
   │  same origin: https://<site>/ and /api/*  (httpOnly refresh cookie + Bearer access token)
   ▼
Cloudflare Worker (static assets + /api proxy; retries while the API wakes up)
   │  /api/* only
   ▼
Express API /api/v1 (Render free web service, bundled with esbuild)
   ├─ middleware: helmet, cors, rate-limit (production), request-id, pino logger (redacted), auth, rbac, validate (Zod), error handler
   ├─ modules/*  (routes → service → Prisma; business rules live in services)
   ├─ Prisma + pg ──► PostgreSQL (Docker locally, Neon in production)
   └─ Cloudinary (uploads; images never stored on the API disk)
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
`app/` (providers, router, theme) · `layouts/` (StorefrontLayout, SellerLayout, AdminLayout) · `pages/{storefront,buyer,seller,admin}` · `features/` (auth, cart, catalog, inventory, orders…, each with api hooks + components) · `services/` (axios client with refresh interceptor) · `store/` (small Zustand store for auth/cart UI; server state in TanStack Query) · route-level `React.lazy` code splitting, role guards, below-the-fold sections rendered on demand (`Deferred`), SPA fallback configured in `wrangler.jsonc`.

## Environments
| | Local | Production |
|---|---|---|
| DB | Docker Desktop `postgres:16-alpine` | Neon PostgreSQL 18 (pooled URL for the app, direct URL for migrations) |
| API | `pnpm dev` (tsx watch) | Render free web service (`node apps/api/dist/server.js`), health check `/api/v1/health` |
| Web | Vite dev server, proxies `/api` | Cloudflare Workers static assets; a Worker proxies `/api/*` so the login cookie is first-party |
| Images | Cloudinary | Cloudinary |

## Versions (as built)
Node 22 · pnpm 12 · React 19 · Vite 8 · TypeScript 5.9 · Prisma 7 (adapter-pg) · Express 5 · Zod 4 · MUI 9 · Tailwind 4 · PostgreSQL 16 locally, 18 on Neon. `CLAUDE.md` explains why some are pinned.
