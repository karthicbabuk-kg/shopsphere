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
