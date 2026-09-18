-- =============================================================================
-- Public storefront launch: Willhaben redirect links, wishlists, admin roles
-- =============================================================================
-- Vindera is opening a public storefront (no cart, no payment processing — a
-- "Buy on Willhaben" button that deep-links to the live listing) on top of
-- what used to be a single-operator admin tool. That changes who can sign in:
-- previously "authenticated" meant "the one admin". Now it means "anyone who
-- signed up to browse the store". Every existing `USING (true)` policy that
-- gated on "TO authenticated" alone would otherwise hand every customer
-- account read access to buy prices, profit margins and purchase theses.
--
-- This migration:
--   1. Adds `willhaben_url` to `opportunities` (the link the storefront button
--      opens).
--   2. Creates `wishlists`, owned per-user via RLS.
--   3. Introduces `admin_users` + `is_admin()` so admin-only data can be
--      gated on actual admin membership instead of "any logged-in user".
--   4. Tightens the existing SELECT/UPDATE policies on products,
--      price_history, opportunities and generated_listings to admin-only.
--   5. Adds a `storefront_listings` view exposing only customer-safe columns
--      for in_inventory/listed items, readable by anon + authenticated.
--
-- The backend is unaffected: it uses the service role key, which bypasses
-- RLS by design.
-- =============================================================================

-- --- 1. Willhaben redirect link -----------------------------------------------

ALTER TABLE "public"."opportunities"
  ADD COLUMN "willhaben_url" text;

-- --- 2. Wishlists --------------------------------------------------------------

CREATE TABLE "public"."wishlists" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "opportunity_id"  uuid                     NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "wishlists_pkey" PRIMARY KEY (id),
  CONSTRAINT "wishlists_user_opportunity_key" UNIQUE (user_id, opportunity_id)
);

ALTER TABLE "public"."wishlists" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wishlists_select_own"
  ON "public"."wishlists" FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "wishlists_insert_own"
  ON "public"."wishlists" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "wishlists_delete_own"
  ON "public"."wishlists" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON TABLE "public"."wishlists" TO "authenticated";

-- --- 3. Admin roles --------------------------------------------------------

CREATE TABLE "public"."admin_users" (
  "user_id"    uuid                     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "email"      text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "admin_users_pkey" PRIMARY KEY (user_id)
);

-- No policies on purpose: nobody queries this table directly from the
-- browser. RLS enabled + no grants to anon/authenticated means it is
-- invisible to both; only the service role and the SECURITY DEFINER
-- function below can read it.
ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION "public"."is_admin"()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "anon", "authenticated";

-- Seed every account that exists as of this migration as an admin. Before
-- today, "authenticated" *meant* "the operator" — public sign-up did not
-- exist yet — so every pre-existing account was already trusted with full
-- admin access. Grandfathering all of them in (instead of matching a single
-- hardcoded email, which would silently lock everyone out if it were wrong)
-- keeps that guarantee. Prune any that shouldn't have stayed admin, and add
-- new ones later, with:
--   DELETE FROM public.admin_users WHERE email = 'someone@example.com';
--   INSERT INTO public.admin_users (user_id, email)
--   SELECT id, email FROM auth.users WHERE email = 'someone@example.com';
INSERT INTO "public"."admin_users" (user_id, email)
SELECT id, email FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- --- 4. Restrict admin data to admins, not "anyone logged in" ---------------

DROP POLICY IF EXISTS "products_select_authenticated" ON "public"."products";
CREATE POLICY "products_select_admin"
  ON "public"."products" FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "price_history_select_authenticated" ON "public"."price_history";
CREATE POLICY "price_history_select_admin"
  ON "public"."price_history" FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "generated_listings_select_authenticated" ON "public"."generated_listings";
CREATE POLICY "generated_listings_select_admin"
  ON "public"."generated_listings" FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "opportunities_select_authenticated" ON "public"."opportunities";
CREATE POLICY "opportunities_select_admin"
  ON "public"."opportunities" FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "opportunities_update_authenticated" ON "public"."opportunities";
CREATE POLICY "opportunities_update_admin"
  ON "public"."opportunities" FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- --- 5. Public storefront view -----------------------------------------------
-- Row filtering (only in_inventory/listed) AND column filtering (no prices
-- paid, no margins, no internal notes) both live in this view, so it stays
-- safe to expose to anon regardless of the admin-only policies above.

CREATE OR REPLACE VIEW "public"."storefront_listings" AS
SELECT
  o.id,
  o.target_sell_price,
  o.product_condition,
  o.willhaben_url,
  o.status,
  p.title,
  p.image_url,
  p.category
FROM public.opportunities o
JOIN public.products p ON p.id = o.product_id
WHERE o.status IN ('in_inventory', 'listed');

GRANT SELECT ON "public"."storefront_listings" TO "anon", "authenticated";
