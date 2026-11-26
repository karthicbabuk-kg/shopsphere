-- Phase 8: seller orders record their share of the coupon discount.
ALTER TABLE "seller_orders" ADD COLUMN "discountPaise" INTEGER NOT NULL DEFAULT 0;

-- Order money can never be negative.
ALTER TABLE "seller_orders" ADD CONSTRAINT "seller_orders_money_nonneg"
  CHECK ("subtotalPaise" >= 0 AND "discountPaise" >= 0 AND "deliveryPaise" >= 0 AND "totalPaise" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_money_nonneg"
  CHECK ("subtotalPaise" >= 0 AND "discountPaise" >= 0 AND "deliveryPaise" >= 0 AND "totalPaise" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_qty_positive" CHECK ("quantity" > 0);
