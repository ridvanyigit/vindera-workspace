-- =============================================================================
-- Dead-stock push notification tracking
-- =============================================================================
-- The backend's daily dead-stock scan (POST /api/v1/deals/dead-stock/scan)
-- pushes a Pushover notification for items that have tied up capital for more
-- than 60 days. This column records when that push was sent so an item is
-- announced exactly once, when it first crosses the threshold, and not again
-- on every daily run.
--
-- Nullable with no default: existing rows are unaffected and NULL means
-- "not yet notified". Written only by the backend (service role).
--
-- `storefront_listings` is intentionally NOT touched. A view only exposes the
-- columns it names, so this column stays private.
-- =============================================================================

ALTER TABLE "public"."opportunities"
  ADD COLUMN "dead_stock_notified_at" timestamp with time zone;
