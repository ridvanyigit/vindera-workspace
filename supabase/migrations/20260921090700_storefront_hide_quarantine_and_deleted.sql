-- =============================================================================
-- storefront_listings: hide quarantined and soft-deleted units
-- =============================================================================
-- Why (launch-hardening audit):
--   D3  The public view only filtered on status, so a unit in quarantine
--       ("REVIEW NEEDED": damaged, returned, or awaiting inspection) or a
--       soft-deleted unit could still be shown to customers.
--
-- Only the WHERE clause is tightened. The column list and order are exactly
-- those of the previous definition (20260918101456_storefront_listed_at.sql),
-- and NO column is added: buy price, margins, theses and every other internal
-- field stay private. Grants are unchanged (anon + authenticated may SELECT).
-- =============================================================================

CREATE OR REPLACE VIEW "public"."storefront_listings" AS
SELECT
  o.id,
  o.target_sell_price,
  o.product_condition,
  o.willhaben_url,
  o.status,
  p.title,
  p.image_url,
  p.category,
  p.gallery_image_urls,
  gl.generated_title,
  gl.generated_description,
  o.created_at
FROM public.opportunities o
JOIN public.products p ON p.id = o.product_id
LEFT JOIN LATERAL (
  SELECT generated_title, generated_description
  FROM public.generated_listings
  WHERE opportunity_id = o.id
  ORDER BY created_at DESC
  LIMIT 1
) gl ON true
WHERE o.status IN ('in_inventory', 'listed')
  AND COALESCE(o.is_quarantine, false) = false
  AND o.deleted_at IS NULL;

GRANT SELECT ON "public"."storefront_listings" TO "anon", "authenticated";
