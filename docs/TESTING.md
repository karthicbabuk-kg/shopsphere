# Testing

| Layer | Tool | Command | Covers (so far) |
|---|---|---|---|
| API integration | Vitest + Supertest, `shopsphere_test` DB (Cloudinary mocked) | `pnpm --filter @shopsphere/api test` | auth, roles, approvals, ownership isolation, SKU rules, ledger immutability, no-oversell races, stock lifecycle, counts, alerts, uploads, **storefront visibility (draft/pending/rejected/suspended/archived products, suspended sellers, inactive categories), search, filters, facets, sorting, paging, detail and reviews, cart maths and limits, issue flags, buyer isolation, wishlist, and Phase 8: order maths, status machine, multi-seller orders, idempotency, oversell race, rollback, cancel and refund, seller lifecycle, returns, reviews, address isolation** |
| Web unit | Vitest + React Testing Library | `pnpm --filter @shopsphere/web test` | login validation, role guards, money/CDN/time helpers |
| End to end | Playwright (Chromium, desktop + Pixel 7) | `pnpm e2e` | seller approval, catalogue, inventory (see earlier phases) and **storefront: search with suggestions, filters and sorting, product options and stock hints, guest redirect, buyer wishlist and cart with exact totals and delivery rules, role notice, mobile layout, and Phase 8: checkout with address and coupon, declined and successful demo payment, seller fulfilment, tracking, invoice, review, return and refund, COD cancel, mobile checkout** |
| Static | `pnpm typecheck`, `pnpm lint` | | |

Setup: `docker compose up -d db`, migrate the test DB (`DATABASE_URL=$TEST_DATABASE_URL pnpm --filter @shopsphere/api prisma:deploy`), `pnpm exec playwright install chromium`.
Results are recorded per phase in the project status reports; this file lists what exists, not claims of completeness.
