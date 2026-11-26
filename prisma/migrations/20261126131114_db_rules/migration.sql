-- Inventory can never go negative.
ALTER TABLE "inventories"
  ADD CONSTRAINT "inventories_available_nonneg" CHECK ("available" >= 0),
  ADD CONSTRAINT "inventories_reserved_nonneg" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "inventories_sold_nonneg" CHECK ("sold" >= 0);

-- Stock movements are an immutable ledger.
CREATE OR REPLACE FUNCTION forbid_stock_movement_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movements_immutable
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION forbid_stock_movement_change();

-- Business sanity checks.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_price_valid" CHECK ("pricePaise" > 0 AND "pricePaise" <= "mrpPaise");

-- Search indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "products_name_trgm" ON "products" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "product_variants_sku_trgm" ON "product_variants" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX "inventories_low_stock" ON "inventories" ("available") WHERE "available" <= 10;
