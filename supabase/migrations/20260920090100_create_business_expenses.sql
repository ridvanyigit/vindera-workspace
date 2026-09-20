-- =============================================================================
-- Business expenses
-- =============================================================================
-- Costs that don't belong to a single deal (storage rent, packaging supplies,
-- Keepa / OpenAI subscriptions, ...). The Tax & Reports page subtracts them
-- from gross profit to show a real net profit figure.
--
-- One row per payment: a recurring cost such as rent is entered once per
-- period with `is_recurring = true`. The flag labels the row; it does not
-- generate future rows.
--
-- Access model (same as the rest of the admin schema):
--   * Reads:  admins only, straight from the browser (`is_admin()`).
--   * Writes: FastAPI backend only, through the service role, which bypasses
--             RLS. There are deliberately no INSERT/UPDATE/DELETE policies.
-- =============================================================================

CREATE TABLE "public"."business_expenses" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "description"  text                     NOT NULL,
  "amount"       numeric(10,2)            NOT NULL,
  "category"     text                     NOT NULL,
  "incurred_at"  date                     NOT NULL DEFAULT current_date,
  "is_recurring" boolean                  NOT NULL DEFAULT false,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "business_expenses_pkey" PRIMARY KEY (id),
  CONSTRAINT "business_expenses_amount_positive" CHECK (amount > 0)
);

CREATE INDEX "business_expenses_incurred_at_idx"
  ON "public"."business_expenses" (incurred_at DESC);

ALTER TABLE "public"."business_expenses" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_expenses_select_admin"
  ON "public"."business_expenses" FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE "public"."business_expenses" FROM "anon";
REVOKE ALL ON TABLE "public"."business_expenses" FROM "authenticated";
GRANT SELECT ON TABLE "public"."business_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."business_expenses" TO "service_role";
