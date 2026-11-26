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
