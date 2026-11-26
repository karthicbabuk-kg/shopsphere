# ShopSphere

Premium multi-vendor e-commerce and inventory management demo: buyer storefront, seller portal and super-admin portal on one Express API and one PostgreSQL database. Payments are simulated; no real money moves.

> Status: Phase 7 complete (storefront, wishlist, cart, demo catalogue). See `docs/PROJECT_OVERVIEW.md` for the roadmap.

## Stack
React 19 · TypeScript 5.9 · Vite 8 · Tailwind 4 · MUI 9 · TanStack Query · React Hook Form + Zod · Framer Motion · Recharts · Lucide  
Node 22 · Express 5 · Prisma 7 · PostgreSQL 16 · Zod 4 · JWT · Pino · Vitest · Supertest

## Quick start (Windows/macOS/Linux)
Prerequisites: Node 22+, pnpm, Docker Desktop.

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

- API docs: http://localhost:4000/api/docs · health: http://localhost:4000/api/v1/health
- Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

If port 5433 is taken, change `POSTGRES_PORT` and the ports in `DATABASE_URL`/`TEST_DATABASE_URL`.

## Documentation
`docs/` – design analysis, design system, UX guidelines, architecture, database/ER diagram, environment variables. Deployment, API, testing and demo guides are added in later phases.
