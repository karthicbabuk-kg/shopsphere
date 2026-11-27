# Free hosting: what was chosen and why

Checked on 2026-11-27 against the providers' own pages (linked). Free tiers change; re-read the linked page before relying on a number.

## Chosen stack
| Part | Provider | Why |
|---|---|---|
| Database | **Neon** (PostgreSQL, Singapore) | Real Postgres with trigram indexes, no expiry on the free plan |
| API | **Render** free web service (Singapore) | Runs a normal Node server; no code changes for serverless |
| Website | **Cloudflare Pages** (+ a Pages Function that proxies `/api`) | Static hosting with unlimited bandwidth; the proxy makes the login cookie first-party |
| Images | **Cloudinary** (already in use) | Hosts the product images |

## Limits that matter for this project
| Provider | Limit (free) | Consequence for ShopSphere |
|---|---|---|
| Neon ([plans](https://neon.com/docs/introduction/free-tier), [limits FAQ](https://neon.com/faqs/free-plan-limits-and-quotas)) | 100 CU-hours compute and 1 GB storage per project per month; compute suspends after 5 idle minutes and this cannot be turned off | Demo data is a few MB. The first request after 5 idle minutes waits for the database to resume (usually seconds). Do **not** run a keep-alive pinger against `/health`: it queries the database and would burn the compute hours |
| Render web service ([free tier](https://render.com/docs/free)) | 750 free instance hours per month; spins down after 15 minutes without traffic; wakes on the next request in about a minute; filesystem is ephemeral; outbound SMTP ports blocked; one instance only | First visit after idle takes up to a minute. The site shows a "demo server is waking up" notice and the proxy retries. Nothing is stored on disk (images are on Cloudinary), so ephemeral storage is fine |
| Render free Postgres ([same page](https://render.com/docs/free)) | Expires 30 days after creation, no backups | **Not used** for that reason |
| Cloudflare Pages ([limits](https://developers.cloudflare.com/pages/platform/limits)) | 500 builds per month, 20,000 files per site, unlimited bandwidth | Plenty for a demo. Pages Functions (the `/api` proxy) have their own free request allowance; see the Workers pricing page |

## Things the provider pages did not state (verify when signing up)
- Whether Render requires a payment method for a free web service. The docs describe what happens *without* one (services suspend if bandwidth or build minutes run out), which implies it is optional, but the create flow was not checked.
- Render's outbound bandwidth allowance (shown in the dashboard under billing).
- Whether Neon asks for a card at sign-up.

If any of these ask for a card you do not want to provide, stop at that step and tell me; nothing here requires a paid plan.

## Alternatives considered
- **Render + Render Postgres**: simpler, but the database is deleted after 30 days plus a 14-day grace period.
- **Everything on Cloudflare (Workers + D1)**: would need a different database and a rewrite of the Prisma layer; rejected as out of scope.
- **Direct browser-to-API calls (no proxy)**: works in Chrome, but Safari and strict Firefox block the cross-site login cookie, so users would be signed out on every reload. The proxy avoids this.
