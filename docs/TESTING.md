# Testing

| Layer | Tool | Command | Covers (so far) |
|---|---|---|---|
| API integration | Vitest + Supertest, `shopsphere_test` DB (Cloudinary mocked) | `pnpm --filter @shopsphere/api test` | auth, roles, token rotation, seller and product approval, ownership isolation, SKU uniqueness, ledger accuracy and immutability, no-negative-stock, parallel purchases never oversell (25 outward and 30 reserve races), order-lifecycle bookkeeping, counts and reconciliation, threshold alerts, upload validation |
| Web unit | Vitest + React Testing Library | `pnpm --filter @shopsphere/web test` | login validation, role guards |
| End to end | Playwright (Chromium, desktop + Pixel 7) | `pnpm e2e` | seller approval; route protection; product draft and validation; admin catalogue CRUD; real Cloudinary upload, submit and approve; inventory: stock out, reorder alert and notification, over-take blocked, stock in, count, discrepancy, apply, ledger and filter, dashboard widget |
| Static | `pnpm typecheck`, `pnpm lint` | | |

Setup: `docker compose up -d db`, migrate the test DB (`DATABASE_URL=$TEST_DATABASE_URL pnpm --filter @shopsphere/api prisma:deploy`), `pnpm exec playwright install chromium`.
Results are recorded per phase in the project status reports; this file lists what exists, not claims of completeness.
