-- =============================================================================
-- Storefront product detail page support
-- =============================================================================
-- The storefront is growing an Amazon-style product detail page: an image
-- gallery (main photo + thumbnails) and the real Willhaben ad copy shown as
-- "Product details". Neither existed as customer-facing data before.
--
--   1. `products.gallery_image_urls` — extra photos beyond the cover image.
--   2. `storefront_listings` gains gallery_image_urls plus the ad title and
--      description from `generated_listings` (harmless to expose: it is the
--      exact text already public on the live Willhaben ad).
-- =============================================================================

ALTER TABLE "public"."products"
  ADD COLUMN "gallery_image_urls" text[] NOT NULL DEFAULT '{}';

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
  gl.generated_description
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
