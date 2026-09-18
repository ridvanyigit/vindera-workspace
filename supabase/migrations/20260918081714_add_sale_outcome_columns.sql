-- =============================================================================
-- Sale outcome columns on opportunities
-- =============================================================================
-- Captures what actually happened when a deal sells, on top of the AI's
-- pre-sale estimates (target_sell_price, profit_margin, etc.). This is the
-- ground-truth training data for a future ML model that predicts time to
-- sell, net profit and buyer demand for a new product.
--
-- Every column is nullable: the scan pipeline and existing rows are
-- unaffected, and these are only populated when a deal is marked 'sold'.
-- =============================================================================

ALTER TABLE "public"."opportunities"
  ADD COLUMN "actual_sell_price"        numeric(10,2),
  ADD COLUMN "actual_profit"            numeric(10,2),
  ADD COLUMN "shipping_and_prep_cost"   numeric(10,2),
  ADD COLUMN "platform_fees"            numeric(10,2),
  ADD COLUMN "customer_inquiries_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "customer_messages_summary" text,
  ADD COLUMN "sold_during_event"        character varying(100),
  ADD COLUMN "time_to_sell_days"        integer;
