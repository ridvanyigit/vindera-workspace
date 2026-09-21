-- =============================================================================
-- Reproducible realtime publication and events_calendar rows
-- =============================================================================
-- Why (launch-hardening audit):
--   I2  Two things existed on the hosted project only because someone clicked
--       them into place, so a fresh database could not reproduce them:
--         * the dashboard auto-refreshes through Supabase Realtime
--           (`postgres_changes` on `opportunities`), which needs the table to
--           be part of the `supabase_realtime` publication;
--         * `events_calendar` rows (AI seasonality context and the Smart Radar
--           countdown). supabase/seed.sql only runs on a local `db reset`, so
--           the hosted project never received them.
--
-- Both statements are guarded and safe to run repeatedly. The event rows are
-- the same ones as in supabase/seed.sql (whose own guard makes re-running it
-- harmless).
-- =============================================================================

-- --- Realtime: opportunities --------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'opportunities'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.opportunities;
  END IF;
END $$;

-- --- Seasonal events ---------------------------------------------------------

INSERT INTO "public"."events_calendar" ("event_name", "event_date", "target_categories")
SELECT * FROM (VALUES
  ('Halloween',           date '2026-10-31', ARRAY['Toys & Baby','Home & Garden']),
  ('Black Friday',        date '2026-11-27', ARRAY['Technology & Electronics','Toys & Baby']),
  ('Christmas',           date '2026-12-24', ARRAY['Toys & Baby','Technology & Electronics','Fashion & Clothing']),
  ('Winter Sales (WSV)',  date '2027-01-07', ARRAY['Fashion & Clothing','Home & Garden']),
  ('Valentine''s Day',    date '2027-02-14', ARRAY['Fashion & Clothing','Home & Garden']),
  ('Easter',              date '2027-03-28', ARRAY['Toys & Baby','Home & Garden']),
  ('Gardening Season',    date '2027-04-01', ARRAY['Home & Garden','Sports & Outdoors'])
) AS seed ("event_name", "event_date", "target_categories")
WHERE NOT EXISTS (
  SELECT 1 FROM "public"."events_calendar" existing
  WHERE existing."event_name" = seed."event_name"
    AND existing."event_date" = seed."event_date"
);
