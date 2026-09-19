-- =============================================================================
-- Remove the customer account / wishlist system
-- =============================================================================
-- Product decision: nothing is purchasable on Vindera itself (every item
-- redirects to its live Willhaben listing), so a wishlist tied to a
-- customer account never had anything to do beyond bookmark a page a
-- browser can already bookmark. Keeping it meant carrying real GDPR/DSGVO
-- data-processing obligations (accounts, passwords, stored preferences) for
-- a feature with no functional payoff — precisely the kind of legal surface
-- the whole no-cart, redirect-to-Willhaben design was meant to avoid.
--
-- Verified before writing this migration: exactly one auth.users row (the
-- site operator) and one wishlists row (from manual testing) exist, so
-- nothing real is lost.
--
-- admin_users / is_admin() are untouched — the admin back office keeps its
-- own separate login, entirely independent of this.
-- =============================================================================

DROP POLICY IF EXISTS "wishlists_select_own" ON "public"."wishlists";
DROP POLICY IF EXISTS "wishlists_insert_own" ON "public"."wishlists";
DROP POLICY IF EXISTS "wishlists_delete_own" ON "public"."wishlists";

DROP TABLE IF EXISTS "public"."wishlists";
