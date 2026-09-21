-- =============================================================================
-- Uniqueness rules: SKU, one open scan row per product, price history points
-- =============================================================================
-- Why (launch-hardening audit):
--   D4  Nothing prevented two units sharing a SKU.
--   D1  The scan pipeline inserted a NEW opportunity on every run for the same
--       ASIN (n8n scans three ASINs daily, so ~3 duplicate rows per day).
--   D2  Price history could hold the same point twice.
--
-- The hosted database may already contain such duplicates, so each rule first
-- cleans the data, then adds the constraint:
--   * Duplicate OPEN scan rows (status pending / rejected) keep the newest and
--     the older ones are SOFT-deleted (`deleted_at` set), never hard-deleted.
--     Bought / listed / sold rows are never touched.
--   * SKU duplicates: a live row keeps its SKU (oldest first); the others get a
--     suffix.
--   * Exact duplicate price points (same product and timestamp) are collapsed.
--
-- Idempotent: safe to run more than once.
-- =============================================================================

-- --- 1. One open scan row per product ----------------------------------------
-- "Open" = a scan result nobody has bought yet. Re-scanning refreshes that row
-- (see persist_scan_result) instead of adding another. Done first, so the SKU
-- clean-up below can favour the rows that stay visible.

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "product_id"
      ORDER BY "created_at" DESC NULLS LAST, "id" DESC
    ) AS rn
  FROM "public"."opportunities"
  WHERE "status" IN ('pending', 'rejected')
    AND "deleted_at" IS NULL
    AND "product_id" IS NOT NULL
)
UPDATE "public"."opportunities" o
SET "deleted_at" = now()
FROM ranked r
WHERE o."id" = r."id" AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "opportunities_one_open_scan_per_product"
  ON "public"."opportunities" ("product_id")
  WHERE "status" IN ('pending', 'rejected') AND "deleted_at" IS NULL;

-- --- 2. SKU ----------------------------------------------------------------------

UPDATE "public"."opportunities"
SET "sku" = btrim("sku")
WHERE "sku" IS NOT NULL AND "sku" <> btrim("sku");

UPDATE "public"."opportunities"
SET "sku" = NULL
WHERE "sku" IS NOT NULL AND "sku" = '';

-- Among rows sharing a SKU, a live (not soft-deleted) row keeps it, oldest
-- first. The others become '<sku prefix>-D<n><4 hex of the id>' (at most 49
-- characters, the column allows 50), which cannot realistically collide with an
-- existing SKU.
WITH ranked AS (
  SELECT
    "id",
    "sku",
    row_number() OVER (
      PARTITION BY "sku"
      ORDER BY ("deleted_at" IS NOT NULL), "created_at" NULLS LAST, "id"
    ) AS rn
  FROM "public"."opportunities"
  WHERE "sku" IS NOT NULL
)
UPDATE "public"."opportunities" o
SET "sku" = left(r."sku", 40) || '-D' || r.rn::text || substr(md5(o."id"::text), 1, 4)
FROM ranked r
WHERE o."id" = r."id" AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "opportunities_sku_unique"
  ON "public"."opportunities" ("sku")
  WHERE "sku" IS NOT NULL;

-- --- 3. Price history: one point per product and instant ----------------------

DELETE FROM "public"."price_history" a
USING "public"."price_history" b
WHERE a."product_id" = b."product_id"
  AND a."recorded_at" = b."recorded_at"
  AND a."ctid" > b."ctid";

CREATE UNIQUE INDEX IF NOT EXISTS "price_history_product_recorded_at_key"
  ON "public"."price_history" ("product_id", "recorded_at");
