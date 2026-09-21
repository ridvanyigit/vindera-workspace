-- =============================================================================
-- Products and sold units can no longer be hard-deleted
-- =============================================================================
-- Why (launch-hardening audit):
--   S3  The chatbot's `/delete ASIN` deleted a product and, through
--       ON DELETE CASCADE, ALL of its opportunities including sold ones. Those
--       are tax-relevant records.
--   D4  Multi-table deletes cascaded silently.
--
-- What this migration does:
--   1. `opportunities.product_id -> products` becomes ON DELETE RESTRICT: a
--      product cannot be deleted while any opportunity references it.
--      (`price_history` still cascades from products; `generated_listings`
--      still cascades from its opportunity. Both are safe because a sold unit
--      can no longer be deleted at all, see 2 and sale_events.)
--   2. A trigger refuses to hard-delete an opportunity that is `sold` or has
--      any `sale_events`, and refuses to soft-delete one that has sale events.
--      The backend enforces the same rule in Phase 4; this is the safety net.
--
-- Idempotent: safe to run more than once.
-- =============================================================================

-- --- 1. RESTRICT on product -> opportunity ------------------------------------

ALTER TABLE "public"."opportunities" DROP CONSTRAINT IF EXISTS "opportunities_product_id_fkey";
ALTER TABLE "public"."opportunities"
  ADD CONSTRAINT "opportunities_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id") ON DELETE RESTRICT;

-- --- 2. Sold units are permanent records ---------------------------------------

CREATE OR REPLACE FUNCTION "public"."opportunities_protect_sold_records"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'sold'
       OR EXISTS (SELECT 1 FROM public.sale_events WHERE opportunity_id = OLD.id) THEN
      RAISE EXCEPTION
        'Opportunity % is a sold / sale-recorded unit and cannot be deleted (tax-relevant record).', OLD.id
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: soft-deleting a unit that has a recorded sale is refused as well.
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM public.sale_events WHERE opportunity_id = OLD.id) THEN
    RAISE EXCEPTION
      'Opportunity % has recorded sales and cannot be deleted. Record a return instead.', OLD.id
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "public"."opportunities_protect_sold_records"() FROM PUBLIC, "anon", "authenticated";

DROP TRIGGER IF EXISTS "opportunities_protect_sold_delete" ON "public"."opportunities";
CREATE TRIGGER "opportunities_protect_sold_delete"
  BEFORE DELETE ON "public"."opportunities"
  FOR EACH ROW EXECUTE FUNCTION "public"."opportunities_protect_sold_records"();

DROP TRIGGER IF EXISTS "opportunities_protect_sold_softdelete" ON "public"."opportunities";
CREATE TRIGGER "opportunities_protect_sold_softdelete"
  BEFORE UPDATE OF "deleted_at" ON "public"."opportunities"
  FOR EACH ROW EXECUTE FUNCTION "public"."opportunities_protect_sold_records"();
