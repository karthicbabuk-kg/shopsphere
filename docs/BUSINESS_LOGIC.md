# Business Logic

Rules that the code enforces. Extended each phase; the order, commission and return rules arrive in Phases 8–9.

## Inventory (Phase 6)

**Quantities.** Each SKU has an `inventory` row: `available` (can be sold), `reserved` (held for open orders), `sold` (shipped and not returned). All three are `>= 0` (database CHECK constraints). `available + reserved + sold` equals units received minus units written off, so stock is never lost silently.

**Single write path.** Every change goes through `applyChange` (`modules/inventory/inventory.core.ts`): one conditional `UPDATE ... WHERE available + Δ >= 0 AND reserved + Δ >= 0 AND sold + Δ >= 0 RETURNING`. PostgreSQL serialises updates on the row, so two requests competing for the last unit cannot both succeed; the loser matches no row and receives `409`. The ledger row is inserted in the same transaction, so quantities and history cannot diverge.

**Ledger.** `stock_movements` is append-only (a trigger rejects UPDATE and DELETE). Each row stores the seller, type, previous / change / new **available** quantity, reason, reference number and acting user. Consecutive rows for a SKU chain (previous = prior new).

| Movement | available | reserved | sold | Triggered by |
|---|---|---|---|---|
| OPENING | +n | | | Variant created with opening stock |
| INWARD / OUTWARD | ±n | | | Seller stock in / out (outward requires a reason) |
| ADJUSTMENT | ±n | | | Seller manual adjustment (reason required) |
| RESERVE | −n | +n | | Order placed (Phase 8) |
| RELEASE | +n | −n | | Order cancelled before dispatch (Phase 8) |
| SALE | | −n | +n | Order shipped (Phase 8) |
| RETURN_RESTOCK | +n | | −n | Returned goods received (Phase 8) |
| RECONCILIATION | ±n | | | Applying a counted discrepancy |

`reserveStock`, `releaseStock`, `commitSale` and `restockReturn` take a transaction client so the order service can run them inside the order transaction; if any line fails (insufficient stock) the whole order, including earlier reservations, rolls back.

**Counts and discrepancies.** A physical count records `expected` (system quantity at count time), `counted` and `difference`. A mismatch is an *open discrepancy* (alert; only one per SKU). Applying it adds the recorded **difference** to the current quantity, not the counted number, so sales made since the count are preserved. If the correction no longer fits (would go negative) the apply fails with 409, the count stays open and the seller must recount. Apply is a compare-and-set, so only one of two concurrent applies succeeds.

**Alerts.** Status per SKU: `OUT` when available = 0, `LOW` ("reorder required") when 0 < available ≤ reorder level, else `IN_STOCK`. The seller is notified once when a change *crosses* into low or out of stock (not on every later change) and again after restocking and falling again. Open discrepancies are the third alert type.

**Valuation** is available units × selling price (variant price, else product price); cost price is not tracked.

**Edits through the product form never change quantities** of existing SKUs; only opening stock of newly added SKUs is recorded.

## Storefront visibility (Phase 7)
A product is publicly visible only if it is `ACTIVE`, `APPROVED`, not deleted, in an active category, and its seller is `APPROVED`. The single definition lives in `visibleProduct` (`storefront.service.ts`) and is reused by the product list, search suggestions, detail, home sections, related products, wishlist and cart. Suspending a seller or deactivating a category therefore hides products everywhere at once, and carts holding them show an "unavailable" line instead of silently dropping it.

## Cart (Phase 7)
- Only buyer accounts have carts; anonymous visitors are sent to sign in and return to the page they were on.
- The client sends only `variantId` and `quantity`. Prices come from the database at read time, so a seller changing a price is reflected immediately and a tampered request cannot change a price.
- Limits: at most 10 per line and never more than the available stock (409 with `available`). Adding the same variant merges quantities.
- Each line is checked on every read: `UNAVAILABLE` (hidden/removed), `OUT_OF_STOCK`, or `INSUFFICIENT` (quantity above stock). Problem lines stay visible but are excluded from totals and block checkout. The cart does **not** reserve stock; reservation happens when the order is placed (Phase 8).
- Totals (integer paise, `cart.calc.ts`): subtotal = Σ price × quantity; savings = MRP total − subtotal; delivery is charged **per seller shipment** (`deliveryFeePaise`, default ₹49) and waived when that seller's subtotal reaches `freeDeliveryThresholdPaise` (default ₹499); prices are GST-inclusive, so the tax shown is the portion already inside the total, `total × rate / (100% + rate)`, rounded half up; grand total = subtotal + delivery.
- Minimum order value (`minOrderPaise`, default ₹199) must be met to check out.
- Defaults live in `settings.service.ts`; rows in `platform_settings` override them (an admin settings screen arrives with the reports phase).
