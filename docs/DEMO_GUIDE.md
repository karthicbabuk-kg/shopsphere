# ShopSphere demo guide

A 15-minute guided tour for a reviewer, plus the acceptance checklist. Everything is fictional: brands, sellers, buyers, products and images are made up, and payments, refunds and payouts are simulated.

## 1. Before you start
- **Live site:** https://shopsphere.karthicbabu333.workers.dev
- **Free hosting wakes slowly.** The API sleeps after about 15 idle minutes. If nobody has used the site for a while, the first page that needs data shows a "demo server is waking up" notice and can take **a minute or more** (the site retries on its own). Open the site a couple of minutes before a live demo. Once awake it responds normally.
- **Local copy:** `pnpm dev` (see the README) serves the same app at http://localhost:5173.

## 2. Accounts
All demo accounts use the public demo password `ShopDemo2026`, except the administrator (see `DEMO_CREDENTIALS.md`).

| Role | Email | Notes |
|---|---|---|
| Buyer | `buyer.priya@shopsphere.demo` (also `rahul`, `ananya`, `vikram`, `sneha`) | all `@shopsphere.demo` |
| Seller (approved) | `seller.technest@shopsphere.demo` | electronics and home |
| Seller (approved) | `seller.urbankart@shopsphere.demo` | fashion, beauty, sports |
| Seller (pending approval) | `seller.pending@shopsphere.demo` | shows the approval state |
| Admin | `admin@shopsphere.demo` | password is not published; the project owner holds it |

Coupons: `WELCOME10` (10% off, up to ₹200, minimum ₹499), `FLAT100` (₹100 off ≥ ₹999), `FESTIVE15` (15% off, up to ₹500, minimum ₹1,999). Each buyer can use a coupon once. Placing orders as a demo buyer changes demo data (stock, order history); that is expected.

## 3. The tour
### A. Buyer (about 6 minutes)
1. **Home:** hero carousel (pause button, respects the reduced-motion setting), category tiles, product rails, coupon cards that copy their code. Scroll to load the lower sections.
2. **Search "pulse"**: autosuggest appears as you type (keyboard friendly). Open the results; try the brand filter, price slider, "In stock only" and sorting. The URL holds every filter, so the page can be shared or reloaded.
3. **Open a product:** gallery with hover zoom, variant options, "Only N left" when stock is low, a delivery estimate by PIN code, specifications, reviews with a rating breakdown, related products.
4. **Sign in as a buyer**, add two products from **different sellers** to the cart. The cart splits by seller, charges delivery per seller (free at ₹499 per seller), and shows the GST already included.
5. **Checkout:** add an address (try a wrong mobile number to see validation), apply `WELCOME10`, choose **UPI** with the simulator set to "Payment is declined" and place the order: nothing is created and the cart is unchanged. Switch the simulator to "Payment succeeds" and pay. Total, discount and tax are computed by the server; the browser only sends what to buy.
6. **My orders:** open the new order. One order, **two shipments** (one per seller), each with its own progress bar and invoice (print or save as PDF).

### B. Seller (about 4 minutes)
1. Sign in as `seller.technest@shopsphere.demo`. The dashboard shows sales, earnings after the platform fee, orders to fulfil and stock alerts.
2. **Orders:** open the order, then Accept, Start processing, Mark as packed, Ship (choose a carrier; tracking number is optional), Mark as delivered. Each step is a validated transition; a wrong move is refused.
3. **Inventory:** stock moved from available to reserved to sold. Open the ledger tab: every change is recorded and cannot be edited or deleted. Try a stock count that differs from the system quantity to see a discrepancy and how applying it works.
4. **Reports:** switch between 7, 30 and 90 days, read the chart's table version (screen-reader text), export orders as CSV.
5. Back as the buyer: the order is **Delivered**. Write a review (only possible after delivery), then **Return items** with a reason. As the seller approve the return and mark it received; stock goes back on the shelf and the refund is recorded.

### C. Admin (about 4 minutes)
1. Sign in as the administrator. **Sellers:** the pending seller can be approved or rejected with a reason. **Products:** products wait for approval before going live.
2. **Orders:** every order with buyer, shipments, per-shipment commission and full history (read-only on purpose).
3. **Reports:** platform sales, commission, top sellers, sales by category, stock value across all sellers, CSV exports.
4. **Settlements:** create a settlement for a seller's delivered orders, then mark it paid (demo; no money moves). The seller sees the statement under Reports.
5. **Settings:** change the commission or delivery fee; new carts and orders use it, existing orders keep their stored amounts. Every change is audit-logged with old and new values.

## 4. Edge cases worth showing
| Scenario | How | Expected |
|---|---|---|
| Out of stock / low stock | a product marked "Only 3 left"; one SKU is out of stock | purchase disabled or capped; cart flags the line |
| Two buyers, last unit | (tested automatically) | exactly one order succeeds, the other gets a clear conflict; stock never goes negative |
| Retry safety | place an order, repeat the same request | the same order comes back; never a duplicate |
| Cash on delivery above ₹50,000 | add expensive items, choose COD | refused with a clear message |
| Price changed after review | (tested automatically) | the order is refused and the buyer sees the new total |
| Return after 7 days | (tested automatically) | refused: the window has closed |
| Seller suspended | admin suspends a seller | their products disappear everywhere at once |
| Wrong role | open `/admin` as a buyer | redirected; the API answers 403 |
| Tampered request | send a price or role in a request body | ignored; the server decides |

## 5. What is simulated, and what is real
- **Real:** accounts and sessions, role-based access, catalogue, search, stock accounting and its ledger, orders and their status rules, commissions, reports, CSV exports, audit log, image hosting, the database, the deployment.
- **Simulated:** payments (no card or UPI details are ever collected), refunds and settlements (bookkeeping only), shipping carriers and tracking numbers, delivery estimates, email (password-reset tokens are shown on screen in demo mode).
- **Not built (by design for a demo):** real payment gateway, email/SMS, courier integrations, tax filing, multi-currency.

## 6. Measured quality (details in `QA_REPORT.md`)
156 API tests, 28 web unit tests, 23 browser tests (including automated WCAG A/AA scans of every portal), no known dependency vulnerabilities, security review in `SECURITY.md`. Lighthouse on the live site: accessibility 98 to 100, best practices 100, SEO 100; mobile performance is modest (about 41 to 48 on the throttled lab profile) because the app is a client-rendered single-page app.

## 7. Known limitations (honest list)
- Free-tier cold start: up to a minute or more after idle (see section 1).
- Mobile Lighthouse performance is modest; server-side rendering would be the next step.
- Settlements: a shipment returned after it was settled has no automatic clawback.
- Cash-on-delivery returns before the whole order is delivered record no refund (nothing was collected yet).
- The API reference page (`/api/docs`) covers the early modules only; `API_SPECIFICATION.md` is complete.
- Rate-limit counters and the settings cache live in one server process (fine for one instance).
- Browsers other than Chromium were not tested; no screen-reader walkthrough was done.

## 8. Acceptance checklist
| Requirement from the brief | Status | Evidence |
|---|---|---|
| Buyer storefront, seller portal, super-admin portal on one SPA, one API, one database | Done | `ARCHITECTURE.md`, live site |
| Design language derived from the reference site; design system documented | Done | `REFERENCE_DESIGN_ANALYSIS.md`, `DESIGN_SYSTEM.md`, `UX_GUIDELINES.md` |
| Auth with rotating refresh tokens, roles, lockout, secure cookies | Done | `SECURITY.md`, auth tests, authorization matrix test |
| Seller application and admin approval; product approval | Done | `seller-approval` and `catalog` browser tests |
| Categories, brands, products with variants, Cloudinary uploads | Done | catalogue tests, live images |
| Inventory: ledger, alerts, counts, no overselling | Done | inventory and concurrency tests, `BUSINESS_LOGIC.md` |
| Storefront search, filters, product page, wishlist, cart | Done | storefront tests |
| Checkout, coupons, simulated payments, multi-seller orders, tracking | Done | `orders` API and browser tests |
| Seller fulfilment, cancellation, returns, refunds, reviews | Done | `orders` tests, live business-cycle check |
| Reports, charts, commission, settlements, CSV, admin settings | Done | `reports` tests, `QA_REPORT.md` |
| Money in integer paise; never trust client price or stock | Done | rules in code and tests (`SECURITY.md`) |
| No real card data; payments clearly simulated | Done | checkout design, `DEMO_GUIDE` section 5 |
| No default browser alerts; accessible, responsive UI | Done | axe scans, mobile tests |
| No secrets in the frontend or in git; admin seeded securely | Done | `.env` ignored, `SECURITY.md`, seed uses environment variables |
| Demo credentials documented only for seeded accounts | Done | `DEMO_CREDENTIALS.md` |
| Automated tests and QA reported honestly | Done | `TESTING.md`, `QA_REPORT.md` |
| Free-tier deployment (Neon, Render, Cloudflare) verified live | Done, with the cold-start caveat | `DEPLOYMENT.md`, live checks in `QA_REPORT.md` |
| Self-hosting guide for Ubuntu | Written, **not executed on a real server** | `UBUNTU_DEPLOYMENT.md` |
| CI pipeline | Written, **never run on GitHub** | `.github/workflows/ci.yml` |
