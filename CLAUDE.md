# CLAUDE.md – ShopSphere

Multi-vendor e-commerce demo (buyer / seller / admin). Read `docs/PROJECT_OVERVIEW.md` for the roadmap, `docs/ARCHITECTURE.md` and `docs/DATABASE.md` before changing structure.

## Commands (run from repo root; pnpm only)
- `pnpm db:up` – start local Postgres (Docker, **host port 5433**; a Windows Postgres already uses 5432)
- `pnpm dev` – API (:4000) + web (:5173, proxies `/api`)
- `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
- Migrations: `pnpm db:migrate -- --name <name>` (dev), `pnpm --filter @shopsphere/api prisma:deploy` (prod/test)
- Test DB migrate: set `DATABASE_URL=$TEST_DATABASE_URL` then `prisma:deploy`
- Regenerate client: `pnpm --filter @shopsphere/api prisma:generate` (output `apps/api/src/generated/prisma`, git-ignored; run after every fresh clone)

## Layout
`apps/api` Express+Prisma · `apps/web` Vite+React · `packages/shared-*` · `prisma/` schema + migrations (config in `apps/api/prisma.config.ts`).

## Rules
- Money = integer paise. Never floats. Never trust price/stock from the client.
- Seller scoping always from the authenticated token, never request body.
- Inventory changes only through the inventory service; `stock_movements` is append-only (DB trigger); `available/reserved/sold` have CHECK >= 0.
- Business logic in services, not routes. Zod validation at every boundary; standard `{success,data|error}` responses.
- Never log passwords/tokens. No secrets in frontend. `.env` is git-ignored.
- Design tokens/components: `docs/DESIGN_SYSTEM.md`. No default browser alerts.

## Version notes (pinned deliberately)
- TypeScript **5.9** (typescript-eslint does not support TS 7 yet).
- Prisma **7**: needs `@prisma/adapter-pg`; datasource URL lives in `prisma.config.ts`; scripts load `../../.env` via `node --env-file`.
- Vite 8 (Rolldown): `manualChunks` object form unsupported; rely on route-level lazy loading.
- pnpm 12: build scripts are allowed via `allowBuilds` in `pnpm-workspace.yaml`.
- Tailwind 4 (`@theme` tokens in `apps/web/src/index.css`), MUI 9, React 19, Express 5, Zod 4.
- Bash tool: very long heredoc scripts can fail to parse; write files with the Write tool.
- PowerShell: `R` is an alias for Invoke-History; do not name helpers with built-in aliases.

## Status
Phases 1-2 done. Phase 3 (auth) done: API + web login/register/seller-signup/reset, route guards. Next: Phase 4 (admin shell, seller approval).

## Gotchas
- `.env` values containing `#` are truncated by Node's env loader (treated as comment).
- API production build: shared packages export TypeScript source, so `node dist/server.js` will not run as-is; bundle the API (e.g. tsup/esbuild) in Phase 11.
- Web keeps a non-secret `ss_session` localStorage hint so anonymous visitors skip the refresh call.
