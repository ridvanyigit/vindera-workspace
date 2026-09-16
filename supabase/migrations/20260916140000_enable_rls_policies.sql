-- =============================================================================
-- Row Level Security for all application tables
-- =============================================================================
-- Before this migration:
--   * `events_calendar` had RLS enabled but NO policies, so the frontend anon
--     key could never read it and the AI Smart Radar event countdown was always
--     empty.
--   * All other tables had RLS disabled entirely, which meant the public anon
--     key shipped in the frontend bundle could read (and write) the whole
--     database without ever logging in.
--
-- After this migration:
--   * Every table requires an authenticated Supabase session.
--   * The backend is unaffected: it uses the service role key, which bypasses
--     RLS by design.
--
-- Rollback: create a follow-up migration with
--   ALTER TABLE "public"."<table>" DISABLE ROW LEVEL SECURITY;
-- =============================================================================

-- --- Enable RLS --------------------------------------------------------------

ALTER TABLE "public"."events_calendar"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."products"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."price_history"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."opportunities"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."generated_listings" ENABLE ROW LEVEL SECURITY;

-- --- events_calendar: read-only reference data -------------------------------
-- Rows are maintained through the Supabase dashboard or the service role.

DROP POLICY IF EXISTS "events_calendar_select_authenticated" ON "public"."events_calendar";
CREATE POLICY "events_calendar_select_authenticated"
  ON "public"."events_calendar"
  FOR SELECT
  TO authenticated
  USING (true);

-- --- products: read-only from the frontend -----------------------------------

DROP POLICY IF EXISTS "products_select_authenticated" ON "public"."products";
CREATE POLICY "products_select_authenticated"
  ON "public"."products"
  FOR SELECT
  TO authenticated
  USING (true);

-- --- price_history: read-only from the frontend ------------------------------

DROP POLICY IF EXISTS "price_history_select_authenticated" ON "public"."price_history";
CREATE POLICY "price_history_select_authenticated"
  ON "public"."price_history"
  FOR SELECT
  TO authenticated
  USING (true);

-- --- generated_listings: read-only from the frontend -------------------------

DROP POLICY IF EXISTS "generated_listings_select_authenticated" ON "public"."generated_listings";
CREATE POLICY "generated_listings_select_authenticated"
  ON "public"."generated_listings"
  FOR SELECT
  TO authenticated
  USING (true);

-- --- opportunities: read + update -------------------------------------------
-- The workspace attaches invoice URLs directly from the browser; every other
-- mutation goes through the FastAPI backend (service role).

DROP POLICY IF EXISTS "opportunities_select_authenticated" ON "public"."opportunities";
CREATE POLICY "opportunities_select_authenticated"
  ON "public"."opportunities"
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "opportunities_update_authenticated" ON "public"."opportunities";
CREATE POLICY "opportunities_update_authenticated"
  ON "public"."opportunities"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- --- Revoke the blanket anon grants -----------------------------------------
-- The remote schema granted every privilege to `anon`. RLS already blocks the
-- rows, but dropping the grants removes the surface entirely.

REVOKE ALL ON TABLE "public"."events_calendar"    FROM "anon";
REVOKE ALL ON TABLE "public"."products"           FROM "anon";
REVOKE ALL ON TABLE "public"."price_history"      FROM "anon";
REVOKE ALL ON TABLE "public"."opportunities"      FROM "anon";
REVOKE ALL ON TABLE "public"."generated_listings" FROM "anon";
