-- =============================================================================
-- business_settings: single-row configuration for the profit engine
-- =============================================================================
-- Why (launch-hardening audit):
--   C1  Profit was `suggested_price - amazon_price`. It ignored inbound and
--       outbound shipping, packaging, Willhaben / payment fees and returns, so
--       a "profitable" deal could lose money.
--
-- The backend's profit calculator (Phase 3) reads these numbers. They can be
-- overridden per deal; these are only the defaults.
--
-- !!! ASSUMPTIONS TO BE CONFIRMED BY THE OWNER !!!
-- Every default below is a PLACEHOLDER, not a researched fact. Replace them in
-- the Supabase Table Editor (business_settings, the only row) with the real
-- figures before relying on any profit number:
--   outbound_shipping_eur   6.90   Post AT parcel price for a typical item
--   packaging_eur           1.50   packaging material per parcel
--   inbound_shipping_eur    0.00   shipping from Amazon to you (0 = free delivery)
--   platform_fee_pct        0      Willhaben fee, % of sale price (0 = private seller)
--   platform_fee_fixed_eur  0      Willhaben fee per sale, fixed part
--   payment_fee_pct         0      payment provider fee, % of sale price
--   return_reserve_pct      3      money set aside for returns, % of sale price
--   min_net_margin_pct      25     No-Buy rule: minimum net margin on cost
--   min_net_profit_eur      15     No-Buy rule: minimum net profit per unit
--   vat_threshold_eur       55000  Kleinunternehmer turnover limit (confirm with your Steuerberater)
--   vat_warn_pct            80     warn when this % of the threshold is used
--   return_window_days      30     Amazon.de return window
--   listing_legal_footer    ''     legal text appended to every listing, written after legal review
--   listing_payment_text    (see below) payment line used in generated listings
--
-- Access model (same as business_expenses):
--   * Reads:  admins only (`is_admin()`).
--   * Writes: service role only (backend, or the Supabase Table Editor).
--
-- Idempotent: safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."business_settings" (
  "id"                     smallint                 NOT NULL DEFAULT 1,
  "outbound_shipping_eur"  numeric(10,2)            NOT NULL DEFAULT 6.90,
  "packaging_eur"          numeric(10,2)            NOT NULL DEFAULT 1.50,
  "inbound_shipping_eur"   numeric(10,2)            NOT NULL DEFAULT 0,
  "platform_fee_pct"       numeric(5,2)             NOT NULL DEFAULT 0,
  "platform_fee_fixed_eur" numeric(10,2)            NOT NULL DEFAULT 0,
  "payment_fee_pct"        numeric(5,2)             NOT NULL DEFAULT 0,
  "return_reserve_pct"     numeric(5,2)             NOT NULL DEFAULT 3,
  "min_net_margin_pct"     numeric(6,2)             NOT NULL DEFAULT 25,
  "min_net_profit_eur"     numeric(10,2)            NOT NULL DEFAULT 15,
  "vat_threshold_eur"      numeric(12,2)            NOT NULL DEFAULT 55000,
  "vat_warn_pct"           numeric(5,2)             NOT NULL DEFAULT 80,
  "return_window_days"     integer                  NOT NULL DEFAULT 30,
  "listing_legal_footer"   text                     NOT NULL DEFAULT '',
  -- Keeps the wording the listing generator has used so far.
  "listing_payment_text"   text                     NOT NULL DEFAULT 'Barzahlung bei Abholung oder Banküberweisung im Voraus.',
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_settings_single_row" CHECK ("id" = 1),
  CONSTRAINT "business_settings_ranges" CHECK (
    "outbound_shipping_eur" >= 0 AND "packaging_eur" >= 0 AND "inbound_shipping_eur" >= 0
    AND "platform_fee_fixed_eur" >= 0 AND "min_net_profit_eur" >= 0
    AND "platform_fee_pct" BETWEEN 0 AND 100
    AND "payment_fee_pct" BETWEEN 0 AND 100
    AND "return_reserve_pct" BETWEEN 0 AND 100
    AND "min_net_margin_pct" >= 0
    AND "vat_threshold_eur" > 0
    AND "vat_warn_pct" BETWEEN 0 AND 100
    AND "return_window_days" > 0
  )
);

-- Keep `updated_at` honest when the row is edited in the Table Editor.
CREATE OR REPLACE FUNCTION "public"."business_settings_touch_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "public"."business_settings_touch_updated_at"() FROM PUBLIC, "anon", "authenticated";

DROP TRIGGER IF EXISTS "business_settings_touch_updated_at" ON "public"."business_settings";
CREATE TRIGGER "business_settings_touch_updated_at"
  BEFORE UPDATE ON "public"."business_settings"
  FOR EACH ROW EXECUTE FUNCTION "public"."business_settings_touch_updated_at"();

-- The one row, filled from the placeholder defaults above.
INSERT INTO "public"."business_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "public"."business_settings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_settings_select_admin" ON "public"."business_settings";
CREATE POLICY "business_settings_select_admin"
  ON "public"."business_settings" FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE "public"."business_settings" FROM "anon";
REVOKE ALL ON TABLE "public"."business_settings" FROM "authenticated";
GRANT SELECT ON TABLE "public"."business_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."business_settings" TO "service_role";
