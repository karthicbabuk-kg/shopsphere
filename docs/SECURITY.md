# Security

What the system enforces, what was reviewed in Phase 10, and what is knowingly out of scope for a demo.

## Controls in place
| Area | Control |
|---|---|
| Authentication | bcrypt password hashes; 15-minute JWT access token kept in memory; 7-day opaque refresh token stored hashed, rotated on every use, with reuse detection that revokes the whole token family; httpOnly `ss_rt` cookie (Secure and SameSite=None in production, path limited to `/api/v1/auth`); Origin check on refresh; lockout after 5 failed logins in 15 minutes |
| Authorization | Role middleware on every protected router; **ownership is always derived from the token** (buyer, seller or admin id), never from the request body; another user's ids return 404. The route table is walked automatically in `security.test.ts`: every route must answer 401 without a token and 403 to every other role |
| Input validation | Zod schemas (shared with the web forms) at every boundary; unknown fields are stripped; ids must be UUIDs; garbage input never returns 5xx (tested) |
| Money and stock | Integer paise only; prices and stock are read from the database, never from the client; `expectedTotalPaise` only *rejects* an order, it never sets a price; stock changes use one conditional UPDATE, so concurrent buyers cannot oversell; the stock ledger is append-only by trigger |
| Idempotency | `Idempotency-Key` makes retried order requests safe; status changes are compare-and-set |
| Uploads | Real file type from magic bytes (not the client MIME type), 5 MB limit, file-count limit, per-seller Cloudinary folders, upload rate limit |
| Injection | No string-built SQL (raw queries use tagged templates with bound parameters); React escapes output and nothing uses `dangerouslySetInnerHTML`; CSV exports neutralise formula cells |
| Transport and headers | Helmet on the API (HSTS, nosniff, frame options and others); strict CORS allow-list; web `_headers` file sets CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS and cache rules for Cloudflare Pages |
| Abuse limits | Global 300 requests per minute; credential endpoints 30 per 15 minutes; order placement 10 per minute; coupon quotes 30 per minute; review writes 10 per minute; uploads 30 per minute (all production-only so tests are not throttled) |
| Errors and logs | Standard error envelope; no stack traces or internal messages for 500s in production; passwords and tokens are never logged |
| Secrets | `.env` is git-ignored; no secrets in the web bundle; the seed admin password comes from the environment; CI uses throw-away values |
| Dependencies | `pnpm audit` is clean (one high advisory in a Prisma CLI transitive dependency was fixed with a pinned override) and runs in CI at high severity |
| Payments | Simulated. No card number, UPI id or other payment credential is ever collected, sent or stored |

## Phase 10 review: findings and fixes
| Finding | Severity | Fix |
|---|---|---|
| `DEMO_MODE` defaulted to on, so a production deployment that forgot to set it would return password-reset tokens in API responses | High | Defaults to off in production; documented |
| Order placement, coupon quotes and review writes had no tighter limit than the global one (coupon codes could be guessed at 300 per minute) | Medium | Dedicated limiters (see above) |
| Web app had no security headers or CSP | Medium | `apps/web/public/_headers` |
| Advisory GHSA-7589-6fvf-x4pw in `effect` (via Prisma CLI config loader, not used at runtime) | High (dev tool only) | pnpm override to the patched release |
| Text colours below WCAG AA contrast, unnamed or mislabelled icon buttons | Accessibility | Tokens and labels corrected; scanned by axe in CI |

No authorization bypass, injection, mass-assignment or token-handling defect was found. The authorization matrix, forged-token, privilege-escalation and enumeration tests pass.

## Known limits (accepted for a demonstration)
- The settings cache and rate-limit counters are per server process; a multi-instance deployment would need a shared store (Redis).
- Settlements and refunds are simulated bookkeeping; a shipment returned after settlement has no automatic clawback.
- The password-reset token is returned in the response only when `DEMO_MODE` is on; there is no email delivery.
- The CSP `connect-src` allows `https://*.onrender.com`; tighten it to the exact API origin when deploying.
- Access tokens cannot be revoked before their 15-minute expiry (logging out revokes the refresh token only).
