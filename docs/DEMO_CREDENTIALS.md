# Demo Credentials

Only intentionally seeded demo accounts are listed here. No real personal data.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@shopsphere.demo` | Value of `SEED_ADMIN_PASSWORD` in your local `.env` (random per machine; never committed) |

Create it with `pnpm db:seed` (idempotent; it does not overwrite an existing admin's password).

Buyer and seller demo accounts (5 buyers, 2 approved sellers, 1 pending seller) are added with the demo data seed in a later phase; their temporary demo passwords will be listed here at that point.

For the public deployment, set a distinct `SEED_ADMIN_PASSWORD` in the Render environment and share it with the reviewer privately.
