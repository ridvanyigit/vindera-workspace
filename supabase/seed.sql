-- ============================================================================
-- SEED DATA
-- ============================================================================
-- Runs ONLY on `supabase db reset` (local database), after all migrations.
-- It never touches the hosted project — `supabase db push` ignores this file.
--
-- Rules for this file:
--   * DATA ONLY. No CREATE TABLE, no ALTER TABLE, no RLS changes — those all
--     belong in supabase/migrations/.
--   * Must be safe to run on an empty database created from the migrations.
-- ============================================================================

-- Seasonal events used as AI seasonality context and for the Smart Radar
-- countdown in the workspace. The guard keeps the file re-runnable.
insert into public.events_calendar (event_name, event_date, target_categories)
select * from (values
  ('Halloween',           date '2026-10-31', array['Toys & Baby','Home & Garden']),
  ('Black Friday',        date '2026-11-27', array['Technology & Electronics','Toys & Baby']),
  ('Christmas',           date '2026-12-24', array['Toys & Baby','Technology & Electronics','Fashion & Clothing']),
  ('Winter Sales (WSV)',  date '2027-01-07', array['Fashion & Clothing','Home & Garden']),
  ('Valentine''s Day',    date '2027-02-14', array['Fashion & Clothing','Home & Garden']),
  ('Easter',              date '2027-03-28', array['Toys & Baby','Home & Garden']),
  ('Gardening Season',    date '2027-04-01', array['Home & Garden','Sports & Outdoors'])
) as seed(event_name, event_date, target_categories)
where not exists (
  select 1 from public.events_calendar existing
  where existing.event_name = seed.event_name
    and existing.event_date = seed.event_date
);
