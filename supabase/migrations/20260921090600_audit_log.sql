-- =============================================================================
-- audit_log: who changed what on opportunities, and when
-- =============================================================================
-- Why (launch-hardening audit):
--   D6  Prices, status and links could be changed (or a row deleted) with no
--       trace. For a business that must be able to explain its books that is
--       not acceptable.
--
-- A trigger on `opportunities` records:
--   * UPDATE  only when a watched column really changed; old_row / new_row hold
--             just the changed columns, so a row reads like a diff, e.g.
--             old {"status":"listed"}  new {"status":"sold"}.
--   * DELETE  the complete row, so it can be reconstructed.
-- Watched columns: status, buy/target/emergency/realistic prices, actual
-- purchase and inbound/packaging costs, actual sale figures, `deleted_at`,
-- `willhaben_url`, `is_quarantine`, `sku`.
--
-- `changed_by` is the acting admin when known: RPC functions set it from the
-- payload (`vindera.actor`), browser writes use auth.uid(). Direct writes with
-- the service role and no actor record NULL.
--
-- Access: admins can read; nobody can write except the trigger itself
-- (SECURITY DEFINER, fixed search_path).
--
-- Idempotent: safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."audit_log" (
  "id"         bigint                   GENERATED ALWAYS AS IDENTITY,
  "table_name" text                     NOT NULL,
  "row_id"     uuid,
  "action"     text                     NOT NULL,
  "old_row"    jsonb,
  "new_row"    jsonb,
  "changed_by" uuid,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_log_action_check" CHECK ("action" IN ('INSERT', 'UPDATE', 'DELETE'))
);

CREATE INDEX IF NOT EXISTS "audit_log_row_idx"
  ON "public"."audit_log" ("table_name", "row_id", "changed_at" DESC);

CREATE INDEX IF NOT EXISTS "audit_log_changed_at_idx"
  ON "public"."audit_log" ("changed_at" DESC);

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_admin" ON "public"."audit_log";
CREATE POLICY "audit_log_select_admin"
  ON "public"."audit_log" FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE "public"."audit_log" FROM "anon";
REVOKE ALL ON TABLE "public"."audit_log" FROM "authenticated";
GRANT SELECT ON TABLE "public"."audit_log" TO "authenticated";
REVOKE ALL ON TABLE "public"."audit_log" FROM "service_role";
GRANT SELECT ON TABLE "public"."audit_log" TO "service_role";

-- --- Trigger function ----------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."audit_opportunity_changes"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_watched text[] := ARRAY[
    'status', 'buy_price', 'target_sell_price', 'emergency_sell_price',
    'willhaben_realistic_price', 'purchase_price_actual', 'inbound_shipping_cost',
    'packaging_cost', 'actual_sell_price', 'actual_profit', 'shipping_and_prep_cost',
    'platform_fees', 'deleted_at', 'willhaben_url', 'is_quarantine', 'sku'
  ];
  v_actor    uuid;
  v_old      jsonb;
  v_new      jsonb;
  v_old_diff jsonb;
  v_new_diff jsonb;
BEGIN
  -- Actor: set by the RPC functions, else the logged-in user (NULL for service role).
  BEGIN
    v_actor := NULLIF(current_setting('vindera.actor', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_actor := NULL;
  END;
  IF v_actor IS NULL THEN
    v_actor := auth.uid();
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (table_name, row_id, action, old_row, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), v_actor);
    RETURN OLD;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  SELECT jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k)
    INTO v_old_diff, v_new_diff
    FROM unnest(v_watched) AS k
   WHERE (v_old -> k) IS DISTINCT FROM (v_new -> k);

  IF v_old_diff IS NOT NULL THEN
    INSERT INTO public.audit_log (table_name, row_id, action, old_row, new_row, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_old_diff, v_new_diff, v_actor);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "public"."audit_opportunity_changes"() FROM PUBLIC, "anon", "authenticated";

DROP TRIGGER IF EXISTS "opportunities_audit" ON "public"."opportunities";
CREATE TRIGGER "opportunities_audit"
  AFTER UPDATE OR DELETE ON "public"."opportunities"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_opportunity_changes"();
