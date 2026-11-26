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
