-- =============================================================================
-- sale_events: append-only ledger of sales and refunds
-- =============================================================================
-- Why (launch-hardening audit):
--   C3  Reports used `target_sell_price` as revenue and ignored what was really
--       received, the shipping paid and the platform fees.
--   C6  A customer return set the deal back to `in_inventory`, left stale
--       `sold_at` / `actual_*` values and recorded no refund.
--   S3  Austrian bookkeeping records must be kept (~7 years).
--
-- One row per money movement. A sale is positive, a refund is negative:
--     revenue = SUM(amount)      (refunds reduce it)
-- Rows are immutable: corrections are made by adding a compensating event, so
-- the history of what happened is never rewritten. The database enforces this
-- (UPDATE / DELETE / TRUNCATE raise), and `opportunity_id` is ON DELETE
-- RESTRICT, so a unit with a recorded sale can never be hard-deleted.
--
-- Access model (same as business_expenses):
--   * Reads:  admins only, straight from the browser (`is_admin()`).
--   * Writes: FastAPI backend only, through the service role / RPC functions.
--
-- Existing `sold` opportunities are backfilled with one `sale` event each.
--
-- Idempotent: safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."sale_events" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "opportunity_id" uuid                     NOT NULL,
  "event_type"     text                     NOT NULL,
  "amount"         numeric(10,2)            NOT NULL,
  "shipping_cost"  numeric(10,2)            NOT NULL DEFAULT 0,
  "platform_fees"  numeric(10,2)            NOT NULL DEFAULT 0,
  "occurred_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "note"           text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sale_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_events_opportunity_id_fkey"
    FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities" ("id") ON DELETE RESTRICT,
  CONSTRAINT "sale_events_event_type_check" CHECK ("event_type" IN ('sale', 'refund')),
  -- Sale is positive (or zero), refund is negative (or zero).
  CONSTRAINT "sale_events_amount_sign_check" CHECK (
    ("event_type" = 'sale'   AND "amount" >= 0) OR
    ("event_type" = 'refund' AND "amount" <= 0)
  ),
  CONSTRAINT "sale_events_costs_non_negative" CHECK ("shipping_cost" >= 0 AND "platform_fees" >= 0)
);

CREATE INDEX IF NOT EXISTS "sale_events_occurred_at_idx"
  ON "public"."sale_events" ("occurred_at");

CREATE INDEX IF NOT EXISTS "sale_events_opportunity_id_idx"
  ON "public"."sale_events" ("opportunity_id");

-- --- Immutability --------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."sale_events_block_changes"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'sale_events is an append-only ledger (% is not allowed). Record a compensating event instead.', TG_OP
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION "public"."sale_events_block_changes"() FROM PUBLIC, "anon", "authenticated";

DROP TRIGGER IF EXISTS "sale_events_no_update_delete" ON "public"."sale_events";
CREATE TRIGGER "sale_events_no_update_delete"
  BEFORE UPDATE OR DELETE ON "public"."sale_events"
  FOR EACH ROW EXECUTE FUNCTION "public"."sale_events_block_changes"();

DROP TRIGGER IF EXISTS "sale_events_no_truncate" ON "public"."sale_events";
CREATE TRIGGER "sale_events_no_truncate"
  BEFORE TRUNCATE ON "public"."sale_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."sale_events_block_changes"();

-- --- Access --------------------------------------------------------------------

ALTER TABLE "public"."sale_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sale_events_select_admin" ON "public"."sale_events";
CREATE POLICY "sale_events_select_admin"
  ON "public"."sale_events" FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE "public"."sale_events" FROM "anon";
REVOKE ALL ON TABLE "public"."sale_events" FROM "authenticated";
GRANT SELECT ON TABLE "public"."sale_events" TO "authenticated";
REVOKE ALL ON TABLE "public"."sale_events" FROM "service_role";
GRANT SELECT, INSERT ON TABLE "public"."sale_events" TO "service_role";

-- --- Backfill: one `sale` event per existing sold opportunity -----------------
-- Sell price falls back to target_sell_price when actual_sell_price was never
-- filled in; the note says so, so the figure is never mistaken for a real one.
-- Negative legacy shipping / fee values (should not exist) are clamped to 0.

INSERT INTO "public"."sale_events"
  ("opportunity_id", "event_type", "amount", "shipping_cost", "platform_fees", "occurred_at", "note")
SELECT
  o."id",
  'sale',
  GREATEST(COALESCE(o."actual_sell_price", o."target_sell_price", 0), 0),
  GREATEST(COALESCE(o."shipping_and_prep_cost", 0), 0),
  GREATEST(COALESCE(o."platform_fees", 0), 0),
  COALESCE(o."sold_at", o."created_at", now()),
  CASE
    WHEN o."actual_sell_price" IS NOT NULL THEN
      'Backfilled from opportunities.actual_* (migration 20260921090200).'
    WHEN o."target_sell_price" IS NOT NULL THEN
      'Backfilled (migration 20260921090200). actual_sell_price was empty, so the amount is the target_sell_price, not a confirmed price.'
    ELSE
      'Backfilled (migration 20260921090200). No sell price was recorded; the amount is 0.'
  END
FROM "public"."opportunities" o
WHERE o."status" = 'sold'
  AND NOT EXISTS (
    SELECT 1 FROM "public"."sale_events" se
    WHERE se."opportunity_id" = o."id" AND se."event_type" = 'sale'
  );
