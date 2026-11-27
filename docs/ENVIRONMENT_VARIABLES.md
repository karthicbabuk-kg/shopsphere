# Environment Variables

Copy `.env.example` to `.env` (git-ignored). Never put secrets in the frontend; only `VITE_*` values are exposed to the browser.

| Variable | Used by | Description |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | docker-compose | Local database credentials |
| `POSTGRES_PORT` | docker-compose | Host port (default **5433**) |
| `DATABASE_URL` | api, Prisma | Postgres connection string (Neon pooled URL in production) |
| `TEST_DATABASE_URL` | api tests | `shopsphere_test` database |
| `NODE_ENV` | api | `development` / `test` / `production` |
| `PORT` | api | API port (Render injects its own) |
| `CORS_ORIGIN` | api | Comma-separated allowed web origins |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | api | ≥ 32 random characters each |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | api | Image uploads (Phase 5) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | seed | Demo admin created by the seed (Phase 3) |
| `VITE_API_URL` | web | API origin in production (empty in dev; Vite proxy is used) |

Generate secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## DEMO_MODE (changed in Phase 10)
`DEMO_MODE` enables demo-only simulations, notably returning the password-reset token in the API response instead of emailing it. It defaults to **on** in development and test and **off** in production. A public demo deployment must set `DEMO_MODE=true` explicitly (documented in the deployment guide), so a production API never exposes reset tokens by accident.

## Deployment variables (Phase 11)
| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | API | Runtime connection. On Neon use the **pooled** string (host contains `-pooler`) |
| `DIRECT_URL` | API build and your shell | Direct (non-pooled) Neon string, used only by `prisma migrate deploy`; falls back to `DATABASE_URL` when unset |
| `DB_POOL_MAX` | API | Maximum database connections per instance (default 5) |
| `COOKIE_SAMESITE` | API | `lax` when the site proxies `/api` (the deployed setup), `none` only for direct cross-site calls; default `none` in production, `lax` otherwise |
| `NODE_VERSION` | Render, Cloudflare | `22` |
| `API_ORIGIN` | Cloudflare Pages (runtime variable) | Origin of the API for the `/api` proxy, e.g. `https://shopsphere-api.onrender.com` |
| `VITE_API_URL` | Web build (optional) | Leave unset when using the proxy; set only to call an API domain directly |
