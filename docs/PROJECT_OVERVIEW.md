# ShopSphere – Project Overview and Roadmap

Multi-vendor e-commerce demonstration (buyer, seller, admin portals) built to showcase independent full-stack capability. Demo payments only; no real money moves.

## Design direction (decided in Phase 1)
Neutral canvas + single blue accent, DM Sans/DM Mono, tonal rounded cards, process-first dashboards, derived from the SasthaSoft analysis (see `REFERENCE_DESIGN_ANALYSIS.md`, `DESIGN_SYSTEM.md`, `UX_GUIDELINES.md`).

## Local prerequisites
- Node 22 LTS (installed), pnpm (to install: `corepack enable`), Docker Desktop (to install) for local PostgreSQL, Git.
- Local DB: `docker compose up -d db` (postgres:16-alpine, named volume, healthcheck). `DATABASE_URL` in `.env`.

## Roadmap (each phase ends with tests, doc updates, and a status report)
| Phase | Scope | Exit check |
|---|---|---|
| 1 | Research, design system, architecture, DB design (**done: docs only**) | docs reviewed |
| 2 | Monorepo, Vite web, Express API, Prisma, Docker DB, lint/format, CI skeleton | `pnpm dev` runs web+api+db; `/health` OK |
| 3 | Auth: register, login, JWT + refresh rotation, RBAC, guards | auth integration tests pass |
| 4 | Admin shell, seller registration/approval | seller approval flow works |
| 5 | Categories, brands, product CRUD, Cloudinary uploads, product approval | seller→admin approval verified |
| 6 | Inventory ledger, adjustments, alerts | concurrency + ledger tests pass |
| 7 | Storefront: home, catalogue, search/filters, product page, **plus wishlist and cart** (moved from Phase 8) and the demo catalogue (39 products, images, reviews) | real data, E2E for browse and cart journeys |
| 8 | **Done.** Checkout (addresses, coupons, demo payments), multi-seller orders, tracking, seller fulfilment, cancel/return, review submission | multi-seller order test passes |
| 9 | **Done.** Analytics, reports, commissions, CSV export, charts | numbers reconcile with DB |
| 10 | **Done.** QA, Playwright E2E, accessibility, responsive, security review, performance | full suite green; see QA_REPORT.md and SECURITY.md |
| 11 | **Done.** Neon, Render, Cloudflare: bundled API, Blueprint, same-origin Worker proxy, cold-start handling, live verification (see QA_REPORT.md) | live checks passed |
| 12 | **Done.** Demo guide with acceptance checklist, README and architecture refresh | acceptance checklist complete (one item written but not executed: GitHub CI) |

## Risks and notes
- Render free tier sleeps: UI shows a "waking server" state; document cold-start.
- Cloudinary/Neon free quotas: keep seed images small and reuse them.
- Verify each provider's free-tier terms at deployment (Phase 11) before relying on them.
- Seed demo passwords are placeholders for local/demo use only and are documented in `DEMO_CREDENTIALS.md` (created in Phase 2/3).
