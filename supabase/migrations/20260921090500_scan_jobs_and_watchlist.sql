-- =============================================================================
-- scan_jobs (visible scan history) and watchlist_asins (what n8n scans)
-- =============================================================================
-- Why (launch-hardening audit):
--   R1  A scan ran as a bare background task: no status, no error trail, and
--       a restart silently lost it. A Keepa or OpenAI failure left no trace
--       except a `print` (or, worse, a fake deal).
--   I1  The three ASINs n8n scans were hardcoded in the workflow JSON.
--
-- scan_jobs      one row per requested scan:
--                queued -> running -> succeeded | rejected | failed.
--                `rejected` = the deal was analysed but failed the No-Buy rules.
--                `retry_after` is set when Keepa says its tokens are exhausted.
-- watchlist_asins the ASINs the daily n8n run scans. Edit the rows in the
--                Supabase Table Editor (`active = false` pauses one).
--
-- Access model (same as business_expenses):
--   * Reads:  admins only (`is_admin()`).
--   * Writes: service role only.
--
-- Idempotent: safe to run more than once.
-- =============================================================================

-- --- scan_jobs -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."scan_jobs" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "asin"           text                     NOT NULL,
  "status"         text                     NOT NULL DEFAULT 'queued',
  "error"          text,
  "opportunity_id" uuid                     REFERENCES "public"."opportunities" ("id") ON DELETE SET NULL,
  "retry_after"    timestamp with time zone,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "started_at"     timestamp with time zone,
  "finished_at"    timestamp with time zone,
  CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scan_jobs_status_check"
    CHECK ("status" IN ('queued', 'running', 'succeeded', 'rejected', 'failed'))
);

CREATE INDEX IF NOT EXISTS "scan_jobs_created_at_idx"
  ON "public"."scan_jobs" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "scan_jobs_asin_created_at_idx"
  ON "public"."scan_jobs" ("asin", "created_at" DESC);

ALTER TABLE "public"."scan_jobs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scan_jobs_select_admin" ON "public"."scan_jobs";
CREATE POLICY "scan_jobs_select_admin"
  ON "public"."scan_jobs" FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE "public"."scan_jobs" FROM "anon";
REVOKE ALL ON TABLE "public"."scan_jobs" FROM "authenticated";
GRANT SELECT ON TABLE "public"."scan_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."scan_jobs" TO "service_role";

-- --- watchlist_asins -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."watchlist_asins" (
  "asin"          text                     NOT NULL,
  "note"          text,
  "active"        boolean                  NOT NULL DEFAULT true,
  "max_buy_price" numeric(10,2),
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "watchlist_asins_pkey" PRIMARY KEY ("asin"),
  CONSTRAINT "watchlist_asins_asin_format" CHECK ("asin" ~ '^[A-Z0-9]{10}$'),
  CONSTRAINT "watchlist_asins_max_buy_price_positive"
    CHECK ("max_buy_price" IS NULL OR "max_buy_price" > 0)
);

ALTER TABLE "public"."watchlist_asins" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "watchlist_asins_select_admin" ON "public"."watchlist_asins";
CREATE POLICY "watchlist_asins_select_admin"
  ON "public"."watchlist_asins" FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE "public"."watchlist_asins" FROM "anon";
REVOKE ALL ON TABLE "public"."watchlist_asins" FROM "authenticated";
GRANT SELECT ON TABLE "public"."watchlist_asins" TO "authenticated";
GRANT ALL ON TABLE "public"."watchlist_asins" TO "service_role";

-- The three ASINs that were hardcoded in n8n/Vindera_Daily_Scan.json.
INSERT INTO "public"."watchlist_asins" ("asin", "note")
VALUES
  ('B09Y2MYL5C', 'Seeded from the original n8n workflow'),
  ('B08N5WRWNW', 'Seeded from the original n8n workflow'),
  ('B0CQ8T5Z1P', 'Seeded from the original n8n workflow')
ON CONFLICT ("asin") DO NOTHING;
