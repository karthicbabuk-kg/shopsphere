# Testing

| Layer | Tool | Command | Covers (so far) |
|---|---|---|---|
| API integration | Vitest + Supertest, `shopsphere_test` DB (Cloudinary mocked) | `pnpm --filter @shopsphere/api test` | health, auth, role guards, token rotation, lockout, reset, seller + product approval workflows, transition rules, concurrency, ownership isolation, SKU uniqueness, opening stock ledger, immutable ledger and no-negative-stock constraints, upload validation |
| Web unit | Vitest + React Testing Library | `pnpm --filter @shopsphere/web test` | login validation, role guards |
| End to end | Playwright (Chromium, desktop + Pixel 7) | `pnpm e2e` | seller → admin approval; route protection; login error; mobile drawer; draft product with SKUs and validation; admin category/brand CRUD; real Cloudinary upload → submit → admin approve (skipped without credentials) |
| Static | `pnpm typecheck`, `pnpm lint` | | |

Setup: `docker compose up -d db`, migrate the test DB (`DATABASE_URL=$TEST_DATABASE_URL pnpm --filter @shopsphere/api prisma:deploy`), `pnpm exec playwright install chromium`.
Results are recorded per phase in the project status reports; this file lists what exists, not claims of completeness.
