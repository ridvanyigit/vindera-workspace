-- =============================================================================
-- Lifecycle columns, status constraint and numeric widths on opportunities
-- =============================================================================
-- Why (launch-hardening audit, see docs/LAUNCH-PLAN.md):
--   D4  `status` was free text with no constraint, so any typo or API call could
--       store a state the app does not understand.
--   C7  "Mark as Bought" recorded no actual purchase price, date, order
--       reference or inbound shipping; `buy_price` stayed the scan-time price.
--   C8  `profit_margin numeric(5,2)` overflows above 999.99 and the insert
--       failure was only printed. There was no place for the net estimate.
--   D5  No Amazon return-window tracking (`return_by`).
--   S3  Hard deletes destroyed tax-relevant records; `deleted_at` enables soft
--       deletes (enforced by the backend in Phase 4).
--
-- Every column is nullable, so existing rows and the current backend keep
-- working. Nothing here is exposed publicly: `storefront_listings` only shows
-- the columns it names.
--
-- COST MODEL
--   `buy_price` stays the planned / scan-time price.
--   Effective purchase price = COALESCE(purchase_price_actual, buy_price).
--   Total cost = effective purchase price + inbound_shipping_cost + packaging_cost.
--   Both are available as SQL functions below (and, because they take the row
--   type, as computed columns through PostgREST).
--
-- Idempotent: safe to run more than once.
-- =============================================================================

-- --- 1. Statuses ---------------------------------------------------------------
-- Normalise first, so the constraint below only rejects genuinely unknown values.

UPDATE "public"."opportunities"
SET "status" = 'pending'
WHERE "status" IS NULL OR btrim("status") = '';

UPDATE "public"."opportunities"
SET "status" = lower(btrim("status"))
WHERE "status" <> lower(btrim("status"));

-- Unknown legacy values are never guessed at: stop with a clear message and let
-- the owner decide what they mean.
DO $$
DECLARE
  v_unknown text;
BEGIN
  SELECT string_agg(DISTINCT "status", ', ')
    INTO v_unknown
    FROM "public"."opportunities"
   WHERE "status" NOT IN (
     'pending', 'rejected', 'bought', 'in_inventory', 'listed', 'sold', 'cancelled', 'written_off'
   );

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION
      'opportunities.status contains values outside the allowed set: %. Map them to a valid status before applying this migration.',
      v_unknown;
  END IF;
END $$;

ALTER TABLE "public"."opportunities" ALTER COLUMN "status" SET DEFAULT 'pending';
ALTER TABLE "public"."opportunities" ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "public"."opportunities" DROP CONSTRAINT IF EXISTS "opportunities_status_check";
ALTER TABLE "public"."opportunities"
  ADD CONSTRAINT "opportunities_status_check"
  CHECK ("status" IN (
    'pending', 'rejected', 'bought', 'in_inventory', 'listed', 'sold', 'cancelled', 'written_off'
  ));

-- --- 2. Purchase and lifecycle columns ----------------------------------------

ALTER TABLE "public"."opportunities"
  ADD COLUMN IF NOT EXISTS "purchase_price_actual"      numeric(10,2),
  ADD COLUMN IF NOT EXISTS "purchased_at"               timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "order_ref"                  text,
  ADD COLUMN IF NOT EXISTS "inbound_shipping_cost"      numeric(10,2),
  ADD COLUMN IF NOT EXISTS "packaging_cost"             numeric(10,2),
  ADD COLUMN IF NOT EXISTS "received_at"                timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "listed_at"                  timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "return_by"                  date,
  ADD COLUMN IF NOT EXISTS "deleted_at"                 timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "invoice_path"               text,
  -- One push per day-window bookkeeping, written only by the backend:
  ADD COLUMN IF NOT EXISTS "return_alert_notified_at"   timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_alerted_at"            timestamp with time zone;

ALTER TABLE "public"."opportunities" DROP CONSTRAINT IF EXISTS "opportunities_costs_non_negative";
ALTER TABLE "public"."opportunities"
  ADD CONSTRAINT "opportunities_costs_non_negative"
  CHECK (
    ("purchase_price_actual" IS NULL OR "purchase_price_actual" >= 0)
    AND ("inbound_shipping_cost" IS NULL OR "inbound_shipping_cost" >= 0)
    AND ("packaging_cost" IS NULL OR "packaging_cost" >= 0)
  );

-- --- 3. Numeric widths and the net estimate -----------------------------------
-- Widening numeric(5,2) -> numeric(8,2) needs no data change.

ALTER TABLE "public"."opportunities"
  ALTER COLUMN "profit_margin" TYPE numeric(8,2);

ALTER TABLE "public"."opportunities"
  ADD COLUMN IF NOT EXISTS "net_profit_estimate" numeric(10,2),
  ADD COLUMN IF NOT EXISTS "net_margin_estimate" numeric(8,2);

-- --- 4. Effective cost helpers --------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."effective_purchase_price"(o "public"."opportunities")
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(o.purchase_price_actual, o.buy_price)
$$;

CREATE OR REPLACE FUNCTION "public"."effective_total_cost"(o "public"."opportunities")
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(o.purchase_price_actual, o.buy_price)
       + COALESCE(o.inbound_shipping_cost, 0)
       + COALESCE(o.packaging_cost, 0)
$$;

COMMENT ON FUNCTION "public"."effective_purchase_price"("public"."opportunities") IS
  'What was really paid for the unit: purchase_price_actual, else the planned buy_price.';
COMMENT ON FUNCTION "public"."effective_total_cost"("public"."opportunities") IS
  'effective_purchase_price + inbound_shipping_cost + packaging_cost.';

-- --- 5. Indexes for the queries the new features run ---------------------------

CREATE INDEX IF NOT EXISTS "opportunities_status_idx"
  ON "public"."opportunities" ("status")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "opportunities_return_by_idx"
  ON "public"."opportunities" ("return_by")
  WHERE "return_by" IS NOT NULL AND "deleted_at" IS NULL;
