-- =============================================================================
-- Least-privilege table grants for the browser roles
-- =============================================================================
-- Why (launch-hardening audit, write-path rule):
--   The initial schema granted the `authenticated` role EVERY privilege
--   (INSERT, UPDATE, DELETE, TRUNCATE ...) on the core tables. Row Level
--   Security stops row-level writes, but TRUNCATE is not subject to RLS, and
--   the browser is only ever supposed to READ, with one exception: attaching an
--   invoice to a deal. Every other write goes through the FastAPI backend with
--   the service role.
--
-- After this migration the browser roles (`authenticated`) can:
--   * SELECT the read tables (RLS still limits which rows),
--   * UPDATE only `opportunities.invoice_url` and `opportunities.invoice_path`.
-- `admin_users` is not reachable by the browser roles at all (the SECURITY
-- DEFINER function `is_admin()` reads it on their behalf).
--
-- The service role keeps its full access. Idempotent.
-- =============================================================================

REVOKE ALL ON TABLE "public"."events_calendar"    FROM "authenticated";
REVOKE ALL ON TABLE "public"."products"           FROM "authenticated";
REVOKE ALL ON TABLE "public"."price_history"      FROM "authenticated";
REVOKE ALL ON TABLE "public"."generated_listings" FROM "authenticated";
REVOKE ALL ON TABLE "public"."opportunities"      FROM "authenticated";

GRANT SELECT ON TABLE "public"."events_calendar"    TO "authenticated";
GRANT SELECT ON TABLE "public"."products"           TO "authenticated";
GRANT SELECT ON TABLE "public"."price_history"      TO "authenticated";
GRANT SELECT ON TABLE "public"."generated_listings" TO "authenticated";
GRANT SELECT ON TABLE "public"."opportunities"      TO "authenticated";

-- The one browser write: invoice attachment.
GRANT UPDATE ("invoice_url", "invoice_path") ON TABLE "public"."opportunities" TO "authenticated";

REVOKE ALL ON TABLE "public"."admin_users" FROM "anon";
REVOKE ALL ON TABLE "public"."admin_users" FROM "authenticated";
