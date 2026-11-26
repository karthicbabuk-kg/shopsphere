# API Specification

Base path `/api/v1`. Live, browsable spec: `/api/docs` (Swagger UI, generated from `apps/api/src/config/openapi.ts`). This file records conventions and what is implemented; it grows each phase.

## Conventions
- Success: `{ "success": true, "data": …, "meta"?: { page, pageSize, total, totalPages } }`
- Error: `{ "success": false, "error": { "code", "message", "details"? } }`
- Status codes: 400 bad request · 401 unauthenticated · 403 forbidden · 404 not found · 409 conflict · 422 validation (details = Zod `flatten()`) · 423 account locked · 429 rate limited.
- Money is integer paise. Dates are ISO-8601 UTC.
- Auth: `Authorization: Bearer <accessToken>` (15 min). The refresh token is an httpOnly cookie `ss_rt` scoped to `/api/v1/auth` (7 days, rotated on every use).

## Implemented (Phase 3)
| Method & path | Auth | Purpose |
|---|---|---|
| `POST /auth/register` | – | Buyer registration; creates profile, wishlist, cart |
| `POST /auth/register-seller` | – | Seller application (status `PENDING`), store + default warehouse |
| `POST /auth/login` | – | Sign in; 5 failures → 15 min lock (423) |
| `POST /auth/refresh` | cookie | Rotate refresh token; replaying an old token revokes the whole session family |
| `POST /auth/logout` / `logout-all` | cookie / bearer | Revoke current / all sessions |
| `GET /auth/me` | bearer | Current user |
| `POST /auth/forgot-password` | – | Demo simulation; returns `demoResetToken` when `DEMO_MODE=true` |
| `POST /auth/reset-password` | – | Single-use token, revokes all sessions |
| `GET /sellers/me` | SELLER | Own profile (resolved from the token) |
| `GET /admin/ping` | ADMIN | Role guard check (replaced in Phase 4) |
| `GET /health` | – | API + DB status |

## Security notes
- `/auth/refresh` and `/auth/logout` reject requests whose `Origin` header is not in `CORS_ORIGIN`.
- Credential endpoints are limited to 30 requests / 15 min / IP in addition to the global limit.
- Login responses are identical for unknown email and wrong password; response time is equalised with a dummy hash.
- Concurrent refreshes with the same token: exactly one wins; a token rotated within the last 10 s is rejected without revoking the family (client race, not theft).
- Demo mode (`DEMO_MODE=true`) returns the reset token to anyone who knows an email. Acceptable for fake demo data only; set `DEMO_MODE=false` for anything real.

## Implemented (Phase 4)
| Method & path | Auth | Purpose |
|---|---|---|
| `GET /admin/overview` | ADMIN | Live KPIs: buyers, sellers by status, products, pending approvals, orders, GMV, commission, oldest pending applications |
| `GET /admin/sellers` | ADMIN | List with `status`, `q` (store/business/email), `page`, `pageSize`; returns per-status counts |
| `GET /admin/sellers/:id` | ADMIN | Detail incl. store, documents, last 20 audit entries |
| `POST /admin/sellers/:id/approve\|reject\|suspend\|reactivate` | ADMIN | `reject`/`suspend` require `{ reason }`. Allowed: PENDING/REJECTED→APPROVED, PENDING→REJECTED, APPROVED→SUSPENDED, SUSPENDED→APPROVED. Anything else is 409. Uses an atomic compare-and-set, writes an audit entry and notifies the seller |
| `PATCH /sellers/me` | SELLER | Update own store/business profile (seller resolved from token) |
| `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | any | Own notifications only |

Not yet implemented from the onboarding spec: store logo and demo document upload (needs Cloudinary credentials, delivered with the uploads module in Phase 5).

## Implemented (Phase 5)
| Method & path | Auth | Purpose |
|---|---|---|
| `GET /categories`, `GET /brands` | – | Active two-level category tree; active brands |
| `GET/POST /admin/categories`, `PUT/DELETE /admin/categories/:id` | ADMIN | Manage categories (max two levels; in-use entries cannot be deleted, deactivate instead) |
| `GET/POST /admin/brands`, `PUT/DELETE /admin/brands/:id` | ADMIN | Manage brands (case-insensitive unique names) |
| `GET /seller/products` | SELLER | Own products; `q` (name/SKU), `status`, `approval`, paging; includes stock and low-stock flag |
| `POST /seller/products`, `GET/PUT/DELETE /seller/products/:id` | SELLER | Create / read / full update / archive. Always scoped to the token's seller; other sellers' ids return 404 |
| `GET /admin/products`, `GET /admin/products/:id` | ADMIN | Submitted products only (drafts are private), approval counts, history |
| `POST /admin/products/:id/approve\|reject\|suspend\|reinstate` | ADMIN | Transitions: PENDING→APPROVED/REJECTED, APPROVED→SUSPENDED, SUSPENDED→APPROVED. `reject`/`suspend` need `{ reason }`; else 409 |
| `POST /uploads/product-images` | SELLER | multipart `files` (≤8, ≤5 MB, JPEG/PNG/WebP by magic bytes) → Cloudinary folder `shopsphere/sellers/<sellerId>/products` |
| `POST /sellers/me/logo` | SELLER | multipart `file` → store logo |
| `POST /sellers/me/documents`, `DELETE /sellers/me/documents/:docId` | SELLER | Demo verification documents (PDF/JPEG/PNG), max 10 |

### Product rules
- Money in integer paise; `pricePaise <= mrpPaise` (also a DB CHECK). Variant prices fall back to the product price.
- `status: DRAFT` saves privately; `ACTIVE` submits for review and needs ≥ 1 image and an **approved** store (403 otherwise). Pending sellers can save drafts.
- SKUs are globally unique (409 names the clashing SKU). Opening stock creates the inventory row plus an immutable `OPENING` ledger entry. On update, stock quantities of existing variants are never changed by the form.
- Removing a variant is a soft delete (history kept) and is refused while units are reserved.
- Re-review: an approved product returns to PENDING when name, description, category, brand or images change (price/stock edits do not); a rejected product returns to PENDING when resubmitted. Suspended products cannot be edited.
- Image references are accepted only from our Cloudinary cloud and the caller's own folder; without credentials uploads fail with `503 UPLOADS_NOT_CONFIGURED`.

## Implemented (Phase 6) — Inventory (all SELLER, scoped to the token's seller)
| Method & path | Purpose |
|---|---|
| `GET /seller/inventory` | Stock levels per SKU: available / reserved / sold, reorder level, status (`IN_STOCK`, `LOW`, `OUT`), warehouse, open count. Filters `q`, `status`, paging |
| `GET /seller/inventory/summary` | SKU count, units, low/out counts, open discrepancies, stock value at selling price, alert lists |
| `POST /seller/inventory/:id/inward` | Add stock `{ quantity, reason?, referenceNo? }` |
| `POST /seller/inventory/:id/outward` | Remove stock `{ quantity, reason }` (reason required); 409 if more than available |
| `POST /seller/inventory/:id/adjust` | Manual ± `{ delta, reason }` (reason required); 409 if it would go negative |
| `POST /seller/inventory/:id/count` | Record a physical count `{ countedQty, reason? }`. A mismatch opens a discrepancy (one open per SKU); a match is recorded as applied |
| `PATCH /seller/inventory/:id/settings` | `{ reorderLevel, warehouseId? }` |
| `GET /seller/stock-movements` | The immutable ledger: `type`, `inventoryId`, `from`, `to`, paging; newest first, with the acting user's name |
| `GET /seller/stock-adjustments`, `POST /seller/stock-adjustments/:id/apply\|dismiss` | List counts; apply the difference as a `RECONCILIATION` movement or dismiss it |
| `GET/POST /seller/warehouses` | Simplified locations |

Every successful operation returns `{ previousQty, newQty, referenceNo }`. A reference number is generated (`INW-20261126-4D21E0`) when none is supplied. Other sellers' inventory returns 404.

## Implemented (Phase 7) — Storefront, wishlist, cart
Public catalogue reads send `Cache-Control: public, max-age=30`; cart and wishlist are `no-store`.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /products` | – | Search and list. `q` (every word must match name, SKU, brand or category), `category` (slug; a parent includes its children), `store` (store slug), `brand` (comma list), `minPrice`/`maxPrice` (paise), `rating` (min), `inStock`, `sort` (`popular`, `newest`, `price_asc`, `price_desc`, `rating`), `page`, `pageSize`, `facets=true` |
| `GET /products/suggest?q=` | – | Up to 6 products plus matching categories and brands |
| `GET /products/:slug` | – | Detail: images, specs, variants with stock hints, seller card, review summary, related products |
| `GET /products/:slug/reviews` | – | Paged reviews (`sort`: `recent`, `high`, `low`); authors are shown as "Priya N." |
| `GET /storefront/home` | – | Category counts and the home sections (trending, best sellers, new arrivals, offers, recommended, stores) |
| `GET /coupons/active` | – | Currently valid offers |
| `GET /cart` | BUYER | Items grouped by seller, per-line issues, totals, `canCheckout` |
| `POST /cart/items` | BUYER | `{ variantId, quantity }`; merges with an existing line |
| `PATCH /cart/items/:id`, `DELETE /cart/items/:id`, `DELETE /cart` | BUYER | Set quantity / remove / clear |
| `GET /wishlist`, `POST /wishlist/:productId`, `DELETE /wishlist/:productId` | BUYER | Saved products (idempotent add/remove) |

**Facets** (`facets=true`) return brand counts that ignore the brand filter and a price range that ignores the price filter, so the filter panel can always show alternatives.
**Stock disclosure:** variants expose an exact `leftCount` only when 10 or fewer remain; otherwise only `inStock`.

## Checkout, orders and reviews (Phase 8)
All buyer routes are scoped to the token's user; another buyer's ids return `404`. Seller routes are scoped to the token's seller.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET/POST /addresses`, `PATCH/DELETE /addresses/:id`, `POST /addresses/:id/default` | BUYER | Address book (max 10, soft delete, first address is default) |
| `POST /checkout/quote` | BUYER | `{ couponCode? }` returns server-side subtotal, discount, delivery, GST, total and per-seller shipments. Coupon problems return `400` with a readable message |
| `POST /orders` | BUYER | `{ addressId, paymentMethod: UPI, CARD or COD, couponCode?, demoOutcome?, expectedTotalPaise? }` with optional `Idempotency-Key` header. `201` new order, `200` replay of the same key, `409` stock or price changed (`details.totalPaise`), `402 PAYMENT_FAILED` for a declined demo payment (nothing is created) |
| `GET /orders?filter=ALL, ACTIVE, DELIVERED, CANCELLED or RETURNS` | BUYER | Paged order history |
| `GET /orders/:id` | BUYER | Order with shipments, item snapshots, tracking timeline, payment, refunds |
| `POST /orders/:id/cancel` | BUYER | `{ reason }` cancels every shipment not yet shipped |
| `POST /orders/:id/shipments/:sid/cancel`, `.../return` | BUYER | Cancel one shipment before dispatch / request a return within 7 days of delivery |
| `GET /seller/orders?filter=&q=` | SELLER | Own shipments with status counts |
| `GET /seller/orders/:id` | SELLER | Shipment, ship-to address, payment, commission and the list of allowed `actions` |
| `POST /seller/orders/:id/actions` | SELLER | `{ action: accept, process, pack, ship, deliver, cancel, approve_return, reject_return or receive_return; carrier?, trackingNo?, reason? }` |
| `GET /reviews/mine/:productId`, `PUT /reviews/:productId` | BUYER | Eligibility (a delivered order contains the product) and create or update the buyer's single review; the product rating is recalculated |

No card number, UPI id or other payment credential is ever sent or stored. `demoOutcome` (`SUCCESS` or `FAIL`) simulates the gateway result.
