# Testing

| Layer | Tool | Command | Covers (so far) |
|---|---|---|---|
| API integration | Vitest + Supertest, `shopsphere_test` DB | `pnpm --filter @shopsphere/api test` | health, auth, role guards, token rotation/reuse, lockout, password reset, admin seller workflow, transition rules, concurrency, notification isolation |
| Web unit | Vitest + React Testing Library | `pnpm --filter @shopsphere/web test` | login validation, role guards |
| End to end | Playwright (Chromium, desktop + Pixel 7) | `pnpm e2e` | seller applies → admin approves → seller sees status; route protection; inline login error; mobile drawer; zero console errors on the main flow |
| Static | `pnpm typecheck`, `pnpm lint` | | |

Setup: `docker compose up -d db`, migrate the test DB (`DATABASE_URL=$TEST_DATABASE_URL pnpm --filter @shopsphere/api prisma:deploy`), `pnpm exec playwright install chromium`.
Results are recorded per phase in the project status reports; this file lists what exists, not claims of completeness.
