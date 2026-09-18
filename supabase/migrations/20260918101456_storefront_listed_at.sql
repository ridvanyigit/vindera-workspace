-- =============================================================================
-- Expose listing date on the storefront
-- =============================================================================
-- Powers a real "New Arrivals" rail on the homepage (sorted by how long ago
-- the item was actually added) instead of a fake/random ordering. Knowing
-- when something was listed is normal, non-sensitive e-commerce info.
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
WHERE o.status IN ('in_inventory', 'listed');

GRANT SELECT ON "public"."storefront_listings" TO "anon", "authenticated";
