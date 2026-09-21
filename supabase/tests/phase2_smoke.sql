-- =============================================================================
-- Smoke test for the launch-hardening migrations (Phase 2)
-- =============================================================================
-- Run against the LOCAL database only, after `supabase db reset`:
--
--   docker exec -i supabase_db_vindera-workspace psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/phase2_smoke.sql
--
-- Everything happens inside one transaction that is rolled back at the end, so
-- the database is left untouched. Every check prints "PASS <label>" as a
-- NOTICE; the first failure aborts with "FAIL <label>" and a non-zero exit.
-- =============================================================================

BEGIN;

-- --- helpers (live in pg_temp, gone at the end of the session) -----------------

CREATE FUNCTION pg_temp.ok(p_label text, p_condition boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_condition IS TRUE THEN
    RAISE NOTICE 'PASS %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL %', p_label;
  END IF;
END $$;

-- Runs p_sql (optionally as another role) and requires it to fail with p_state.
CREATE FUNCTION pg_temp.expect_error(p_label text, p_sql text, p_state text, p_role text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    IF p_role IS NOT NULL THEN EXECUTE 'SET LOCAL ROLE ' || p_role; END IF;
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLSTATE = p_state THEN
      RAISE NOTICE 'PASS % (%)', p_label, p_state;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL %: expected SQLSTATE %, got % (%)', p_label, p_state, SQLSTATE, SQLERRM;
  END;
  RESET ROLE;
  RAISE EXCEPTION 'FAIL %: expected SQLSTATE % but the statement succeeded', p_label, p_state;
END $$;

-- Evaluates a scalar query as another role (so RLS / grants apply).
CREATE FUNCTION pg_temp.scalar_as(p_role text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE 'SET LOCAL ROLE ' || p_role;
  EXECUTE p_sql INTO v;
  RESET ROLE;
  RETURN v;
END $$;

-- --- fixtures ---------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', 'other@test.invalid');
INSERT INTO public.admin_users (user_id, email)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'admin@test.invalid');

INSERT INTO public.products (id, asin, amazon_locale, title, category) VALUES
  ('11111111-0000-0000-0000-000000000001', 'TESTASIN01', 'DE', 'Test product 1', 'Other'),
  ('11111111-0000-0000-0000-000000000002', 'TESTASIN02', 'DE', 'Test product 2', 'Other');

-- =============================================================================
-- 1. Constraints
-- =============================================================================

SELECT pg_temp.expect_error('status CHECK rejects unknown value',
  $q$INSERT INTO public.opportunities (product_id, buy_price, status)
     VALUES ('11111111-0000-0000-0000-000000000001', 10, 'hacked')$q$, '23514');

SELECT pg_temp.expect_error('status NOT NULL',
  $q$INSERT INTO public.opportunities (product_id, buy_price, status)
     VALUES ('11111111-0000-0000-0000-000000000001', 10, NULL)$q$, '23502');

INSERT INTO public.opportunities (id, product_id, buy_price, target_sell_price, status, sku)
VALUES ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 10, 30, 'pending', 'SMOKE-1');

SELECT pg_temp.expect_error('SKU must be unique',
  $q$INSERT INTO public.opportunities (product_id, buy_price, status, sku)
     VALUES ('11111111-0000-0000-0000-000000000002', 10, 'bought', 'SMOKE-1')$q$, '23505');

SELECT pg_temp.expect_error('only one open scan row per product',
  $q$INSERT INTO public.opportunities (product_id, buy_price, status, sku)
     VALUES ('11111111-0000-0000-0000-000000000001', 10, 'rejected', 'SMOKE-2')$q$, '23505');

WITH i AS (
  INSERT INTO public.opportunities (product_id, buy_price, status, sku)
  VALUES ('11111111-0000-0000-0000-000000000001', 10, 'bought', 'SMOKE-3') RETURNING id
)
SELECT pg_temp.ok('a second unit of the same product is fine once bought', (SELECT count(*) FROM i) = 1);

SELECT pg_temp.expect_error('negative purchase price rejected',
  $q$UPDATE public.opportunities SET purchase_price_actual = -1 WHERE sku = 'SMOKE-3'$q$, '23514');

SELECT pg_temp.expect_error('profit_margin above 999.99 no longer overflows (fits numeric(8,2))',
  $q$UPDATE public.opportunities SET profit_margin = 99999999 WHERE sku = 'SMOKE-3'$q$, '22003');
WITH u AS (UPDATE public.opportunities SET profit_margin = 1500.50 WHERE sku = 'SMOKE-3' RETURNING id)
SELECT pg_temp.ok('profit_margin 1500.50 fits', (SELECT count(*) FROM u) = 1);

SELECT pg_temp.expect_error('business_settings allows only row id = 1',
  $q$INSERT INTO public.business_settings (id) VALUES (2)$q$, '23514');

SELECT pg_temp.ok('effective_purchase_price falls back to buy_price',
  (SELECT public.effective_purchase_price(o) FROM public.opportunities o WHERE sku = 'SMOKE-3') = 10);
UPDATE public.opportunities SET purchase_price_actual = 8.5, inbound_shipping_cost = 2, packaging_cost = 0.5 WHERE sku = 'SMOKE-3';
SELECT pg_temp.ok('effective_purchase_price uses the actual price',
  (SELECT public.effective_purchase_price(o) FROM public.opportunities o WHERE sku = 'SMOKE-3') = 8.5);
SELECT pg_temp.ok('effective_total_cost adds inbound shipping and packaging',
  (SELECT public.effective_total_cost(o) FROM public.opportunities o WHERE sku = 'SMOKE-3') = 11);

-- =============================================================================
-- 2. Ledger and delete protection
-- =============================================================================

SELECT pg_temp.expect_error('sale must not be negative',
  $q$INSERT INTO public.sale_events (opportunity_id, event_type, amount)
     VALUES ('22222222-0000-0000-0000-000000000001', 'sale', -5)$q$, '23514');
SELECT pg_temp.expect_error('refund must not be positive',
  $q$INSERT INTO public.sale_events (opportunity_id, event_type, amount)
     VALUES ('22222222-0000-0000-0000-000000000001', 'refund', 5)$q$, '23514');
SELECT pg_temp.expect_error('unknown event type',
  $q$INSERT INTO public.sale_events (opportunity_id, event_type, amount)
     VALUES ('22222222-0000-0000-0000-000000000001', 'gift', 5)$q$, '23514');

INSERT INTO public.sale_events (id, opportunity_id, event_type, amount)
VALUES ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'sale', 25);

SELECT pg_temp.expect_error('sale_events cannot be updated',
  $q$UPDATE public.sale_events SET amount = 1 WHERE id = '33333333-0000-0000-0000-000000000001'$q$, '55000');
SELECT pg_temp.expect_error('sale_events cannot be deleted',
  $q$DELETE FROM public.sale_events WHERE id = '33333333-0000-0000-0000-000000000001'$q$, '55000');
SELECT pg_temp.expect_error('sale_events cannot be truncated',
  $q$TRUNCATE public.sale_events$q$, '55000');

SELECT pg_temp.expect_error('a unit with a recorded sale cannot be hard-deleted',
  $q$DELETE FROM public.opportunities WHERE id = '22222222-0000-0000-0000-000000000001'$q$, '55000');
SELECT pg_temp.expect_error('a unit with a recorded sale cannot be soft-deleted',
  $q$UPDATE public.opportunities SET deleted_at = now() WHERE id = '22222222-0000-0000-0000-000000000001'$q$, '55000');
SELECT pg_temp.expect_error('a product with opportunities cannot be deleted',
  $q$DELETE FROM public.products WHERE id = '11111111-0000-0000-0000-000000000001'$q$, '23503');

INSERT INTO public.opportunities (id, product_id, buy_price, status, sku)
VALUES ('22222222-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000002', 5, 'sold', 'SMOKE-SOLD');
SELECT pg_temp.expect_error('a sold unit cannot be hard-deleted even without a ledger row',
  $q$DELETE FROM public.opportunities WHERE id = '22222222-0000-0000-0000-000000000009'$q$, '55000');

-- =============================================================================
-- 3. Storefront view
-- =============================================================================

INSERT INTO public.opportunities (id, product_id, buy_price, target_sell_price, status, sku, is_quarantine)
VALUES
  ('22222222-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-000000000002', 5, 9, 'listed',       'SF-LISTED', false),
  ('22222222-0000-0000-0000-0000000000f2', '11111111-0000-0000-0000-000000000002', 5, 9, 'in_inventory', 'SF-QUAR',   true),
  ('22222222-0000-0000-0000-0000000000f3', '11111111-0000-0000-0000-000000000002', 5, 9, 'listed',       'SF-GONE',   false),
  ('22222222-0000-0000-0000-0000000000f4', '11111111-0000-0000-0000-000000000002', 5, 9, 'bought',       'SF-BOUGHT', false);
UPDATE public.opportunities SET deleted_at = now() WHERE sku = 'SF-GONE';

SELECT pg_temp.ok('storefront shows a normal listed unit',
  EXISTS (SELECT 1 FROM public.storefront_listings WHERE id = '22222222-0000-0000-0000-0000000000f1'));
SELECT pg_temp.ok('storefront hides a quarantined unit',
  NOT EXISTS (SELECT 1 FROM public.storefront_listings WHERE id = '22222222-0000-0000-0000-0000000000f2'));
SELECT pg_temp.ok('storefront hides a soft-deleted unit',
  NOT EXISTS (SELECT 1 FROM public.storefront_listings WHERE id = '22222222-0000-0000-0000-0000000000f3'));
SELECT pg_temp.ok('storefront hides a merely bought unit',
  NOT EXISTS (SELECT 1 FROM public.storefront_listings WHERE id = '22222222-0000-0000-0000-0000000000f4'));
SELECT pg_temp.ok('storefront view still has exactly its 12 public columns',
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'storefront_listings') = 12);
SELECT pg_temp.ok('anon can read the storefront view',
  pg_temp.scalar_as('anon', $q$SELECT count(*)::text FROM public.storefront_listings$q$) IS NOT NULL);

-- =============================================================================
-- 4. Access control
-- =============================================================================

SELECT pg_temp.expect_error('anon cannot read sale_events', 'SELECT * FROM public.sale_events', '42501', 'anon');
SELECT pg_temp.expect_error('anon cannot read business_settings', 'SELECT * FROM public.business_settings', '42501', 'anon');
SELECT pg_temp.expect_error('anon cannot read scan_jobs', 'SELECT * FROM public.scan_jobs', '42501', 'anon');
SELECT pg_temp.expect_error('anon cannot read watchlist_asins', 'SELECT * FROM public.watchlist_asins', '42501', 'anon');
SELECT pg_temp.expect_error('anon cannot read audit_log', 'SELECT * FROM public.audit_log', '42501', 'anon');
SELECT pg_temp.expect_error('anon cannot read opportunities', 'SELECT * FROM public.opportunities', '42501', 'anon');
SELECT pg_temp.expect_error('anon cannot read admin_users', 'SELECT * FROM public.admin_users', '42501', 'anon');

-- Log in as a non-admin, then as the admin.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);

SELECT pg_temp.ok('non-admin user sees no sale_events (RLS)',
  pg_temp.scalar_as('authenticated', 'SELECT count(*)::text FROM public.sale_events') = '0');
SELECT pg_temp.ok('non-admin user sees no opportunities (RLS)',
  pg_temp.scalar_as('authenticated', 'SELECT count(*)::text FROM public.opportunities') = '0');
SELECT pg_temp.ok('non-admin user sees no business_settings (RLS)',
  pg_temp.scalar_as('authenticated', 'SELECT count(*)::text FROM public.business_settings') = '0');
SELECT pg_temp.expect_error('authenticated cannot read admin_users', 'SELECT * FROM public.admin_users', '42501', 'authenticated');

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

SELECT pg_temp.ok('admin sees the sale_events',
  pg_temp.scalar_as('authenticated', 'SELECT count(*)::text FROM public.sale_events')::int >= 1);
SELECT pg_temp.ok('admin sees business_settings',
  pg_temp.scalar_as('authenticated', 'SELECT count(*)::text FROM public.business_settings') = '1');
SELECT pg_temp.ok('admin sees scan watchlist',
  pg_temp.scalar_as('authenticated', 'SELECT count(*)::text FROM public.watchlist_asins')::int >= 3);

SELECT pg_temp.expect_error('admin browser session cannot write business_settings',
  $q$UPDATE public.business_settings SET outbound_shipping_eur = 0$q$, '42501', 'authenticated');
SELECT pg_temp.expect_error('admin browser session cannot insert sale_events',
  $q$INSERT INTO public.sale_events (opportunity_id, event_type, amount)
     VALUES ('22222222-0000-0000-0000-000000000001', 'sale', 1)$q$, '42501', 'authenticated');
SELECT pg_temp.expect_error('admin browser session cannot change a status directly',
  $q$UPDATE public.opportunities SET status = 'sold' WHERE sku = 'SMOKE-3'$q$, '42501', 'authenticated');
SELECT pg_temp.expect_error('admin browser session cannot change a price directly',
  $q$UPDATE public.opportunities SET target_sell_price = 1 WHERE sku = 'SMOKE-3'$q$, '42501', 'authenticated');
SELECT pg_temp.expect_error('admin browser session cannot delete opportunities',
  $q$DELETE FROM public.opportunities WHERE sku = 'SMOKE-3'$q$, '42501', 'authenticated');
SELECT pg_temp.expect_error('admin browser session cannot truncate products',
  $q$TRUNCATE public.products CASCADE$q$, '42501', 'authenticated');

SELECT pg_temp.ok('admin browser session CAN attach an invoice (the one allowed write)',
  pg_temp.scalar_as('authenticated',
    $q$WITH u AS (UPDATE public.opportunities SET invoice_path = 'x/y.pdf' WHERE sku = 'SMOKE-3' RETURNING 1) SELECT count(*)::text FROM u$q$) = '1');

SELECT pg_temp.expect_error('authenticated cannot run persist_scan_result',
  $q$SELECT public.persist_scan_result('{}'::jsonb)$q$, '42501', 'authenticated');
SELECT pg_temp.expect_error('anon cannot run record_sale',
  $q$SELECT public.record_sale('22222222-0000-0000-0000-000000000001', '{}'::jsonb)$q$, '42501', 'anon');
SELECT pg_temp.expect_error('authenticated cannot run create_manual_deal',
  $q$SELECT public.create_manual_deal('{}'::jsonb)$q$, '42501', 'authenticated');
SELECT pg_temp.expect_error('authenticated cannot run record_return',
  $q$SELECT public.record_return('22222222-0000-0000-0000-000000000001', '{}'::jsonb)$q$, '42501', 'authenticated');
SELECT pg_temp.expect_error('authenticated cannot run update_manual_deal',
  $q$SELECT public.update_manual_deal('22222222-0000-0000-0000-000000000001', '{}'::jsonb)$q$, '42501', 'authenticated');

SELECT pg_temp.ok('the service role CAN call the RPCs',
  pg_temp.scalar_as('service_role', $q$SELECT (public.persist_scan_result(jsonb_build_object(
    'asin','SVCROLE001','title','Service role probe','status','pending','buy_price',10)))->>'created'$q$) = 'true');

-- Back to the superuser context for the remaining tests.
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

-- =============================================================================
-- 5. persist_scan_result
-- =============================================================================

INSERT INTO public.scan_jobs (id, asin, status) VALUES ('44444444-0000-0000-0000-000000000001', 'SCANTEST01', 'running');

CREATE TEMP TABLE r1 AS SELECT public.persist_scan_result(jsonb_build_object(
  'asin', 'scantest01', 'title', 'Scanned thing', 'category', 'Technology & Electronics', 'status', 'pending',
  'buy_price', 40, 'target_sell_price', 70, 'profit_margin', 40.5, 'net_profit_estimate', 20, 'net_margin_estimate', 50,
  'emergency_sell_price', 59.5, 'ai_decision', 'first', 'buybox_seller', 'Amazon', 'buybox_is_fba', true,
  'deal_score', 77, 'score_breakdown', jsonb_build_object('demand', 7),
  'listing', jsonb_build_object('generated_title', 'T1', 'generated_description', 'D1'),
  'price_history', jsonb_build_array(
    jsonb_build_object('recorded_at', '2026-08-01T00:00:00Z', 'price_amazon', 60),
    jsonb_build_object('recorded_at', '2026-09-01T00:00:00Z', 'price_amazon', 55)),
  'job_id', '44444444-0000-0000-0000-000000000001', 'actor', '00000000-0000-0000-0000-0000000000a1')) AS j;

SELECT pg_temp.ok('scan creates one opportunity', (SELECT (j->>'created')::boolean FROM r1));
SELECT pg_temp.ok('scan normalises the ASIN to upper case',
  (SELECT count(*) FROM public.products WHERE asin = 'SCANTEST01') = 1);
SELECT pg_temp.ok('scan closes its scan_job as succeeded',
  (SELECT status FROM public.scan_jobs WHERE id = '44444444-0000-0000-0000-000000000001') = 'succeeded');
SELECT pg_temp.ok('scan stored the net estimate',
  (SELECT net_profit_estimate FROM public.opportunities WHERE id = (SELECT (j->>'opportunity_id')::uuid FROM r1)) = 20);

CREATE TEMP TABLE r2 AS SELECT public.persist_scan_result(jsonb_build_object(
  'asin', 'SCANTEST01', 'title', 'Scanned thing v2', 'status', 'rejected', 'buy_price', 42, 'target_sell_price', 50,
  'ai_decision', 'second',
  'listing', jsonb_build_object('generated_title', 'T2', 'generated_description', 'D2'),
  'price_history', jsonb_build_array(
    jsonb_build_object('recorded_at', '2026-09-01T00:00:00Z', 'price_amazon', 999),
    jsonb_build_object('recorded_at', '2026-09-15T00:00:00Z', 'price_amazon', 52)))) AS j;

SELECT pg_temp.ok('a second scan of the same ASIN refreshes the same row',
  (SELECT j->>'opportunity_id' FROM r2) = (SELECT j->>'opportunity_id' FROM r1) AND NOT (SELECT (j->>'created')::boolean FROM r2));
SELECT pg_temp.ok('still exactly one open row for the product',
  (SELECT count(*) FROM public.opportunities o JOIN public.products p ON p.id = o.product_id
    WHERE p.asin = 'SCANTEST01' AND o.status IN ('pending','rejected') AND o.deleted_at IS NULL) = 1);
SELECT pg_temp.ok('the refreshed row took the new status and price',
  (SELECT status || ':' || buy_price FROM public.opportunities WHERE id = (SELECT (j->>'opportunity_id')::uuid FROM r1)) = 'rejected:42.00');
SELECT pg_temp.ok('fields not in the second payload are kept',
  (SELECT deal_score FROM public.opportunities WHERE id = (SELECT (j->>'opportunity_id')::uuid FROM r1)) = 77);
SELECT pg_temp.ok('the listing is updated, not duplicated',
  (SELECT count(*) FROM public.generated_listings WHERE opportunity_id = (SELECT (j->>'opportunity_id')::uuid FROM r1)) = 1
  AND (SELECT generated_title FROM public.generated_listings WHERE opportunity_id = (SELECT (j->>'opportunity_id')::uuid FROM r1)) = 'T2');
SELECT pg_temp.ok('price history: duplicates by (product, recorded_at) are skipped, new points added',
  (SELECT count(*) FROM public.price_history WHERE product_id = (SELECT (j->>'product_id')::uuid FROM r1)) = 3
  AND (SELECT price_amazon FROM public.price_history WHERE product_id = (SELECT (j->>'product_id')::uuid FROM r1) AND recorded_at = '2026-09-01T00:00:00Z') = 55);

SELECT pg_temp.expect_error('scan rejects a bad ASIN',
  $q$SELECT public.persist_scan_result('{"asin":"bad","title":"x","status":"pending","buy_price":1}'::jsonb)$q$, '22023');
SELECT pg_temp.expect_error('scan rejects status sold',
  $q$SELECT public.persist_scan_result('{"asin":"SCANTEST02","title":"x","status":"sold","buy_price":1}'::jsonb)$q$, '22023');
SELECT pg_temp.expect_error('scan rejects a non-positive price',
  $q$SELECT public.persist_scan_result('{"asin":"SCANTEST02","title":"x","status":"pending","buy_price":0}'::jsonb)$q$, '22023');

-- A bought unit is no longer "open": the next scan creates a fresh open row.
UPDATE public.opportunities SET status = 'bought' WHERE id = (SELECT (j->>'opportunity_id')::uuid FROM r1);
CREATE TEMP TABLE r3 AS SELECT public.persist_scan_result(jsonb_build_object(
  'asin', 'SCANTEST01', 'title', 'Scanned thing', 'status', 'pending', 'buy_price', 41)) AS j;
SELECT pg_temp.ok('after buying, a scan opens a new row for the next unit',
  (SELECT (j->>'created')::boolean FROM r3) AND (SELECT j->>'opportunity_id' FROM r3) <> (SELECT j->>'opportunity_id' FROM r1));

-- =============================================================================
-- 6. create_manual_deal / update_manual_deal
-- =============================================================================

CREATE TEMP TABLE m1 AS SELECT public.create_manual_deal(jsonb_build_object(
  'asin', 'MANUAL0001', 'title', 'Manual item', 'buy_price', 20, 'target_sell_price', 45, 'quantity', 3,
  'status', 'in_inventory', 'sku', 'MAN', 'listing_title', 'LT', 'listing_description', 'LD',
  'gallery_image_urls', jsonb_build_array('https://x.test/a.jpg', ' '), 'purchase_price_actual', 19.5,
  'amazon_price_today', 30, 'amazon_price_90d_avg', 50)) AS j;

SELECT pg_temp.ok('manual deal with quantity 3 creates three units',
  jsonb_array_length((SELECT j->'opportunity_ids' FROM m1)) = 3);
SELECT pg_temp.ok('the three units have three different SKUs',
  (SELECT count(DISTINCT s) FROM jsonb_array_elements_text((SELECT j->'skus' FROM m1)) s) = 3);
SELECT pg_temp.ok('each unit has its own listing row',
  (SELECT count(*) FROM public.generated_listings gl
    WHERE gl.opportunity_id IN (SELECT (value)::uuid FROM jsonb_array_elements_text((SELECT j->'opportunity_ids' FROM m1)))) = 3);
SELECT pg_temp.ok('gallery blanks are dropped',
  (SELECT gallery_image_urls FROM public.products WHERE asin = 'MANUAL0001') = ARRAY['https://x.test/a.jpg']);
SELECT pg_temp.ok('two honest price points were stored',
  (SELECT count(*) FROM public.price_history WHERE product_id = (SELECT (j->>'product_id')::uuid FROM m1)) = 2);
SELECT pg_temp.ok('a manual deal has no sale event unless sold',
  NOT EXISTS (SELECT 1 FROM public.sale_events WHERE opportunity_id IN
    (SELECT (value)::uuid FROM jsonb_array_elements_text((SELECT j->'opportunity_ids' FROM m1)))));

SELECT pg_temp.expect_error('manual deal rejects a bad ASIN',
  $q$SELECT public.create_manual_deal('{"asin":"x","title":"t","buy_price":1,"target_sell_price":2,"listing_title":"a","listing_description":"b"}'::jsonb)$q$, '22023');
SELECT pg_temp.expect_error('manual deal rejects quantity 0',
  $q$SELECT public.create_manual_deal('{"asin":"MANUAL0002","title":"t","buy_price":1,"target_sell_price":2,"quantity":0,"listing_title":"a","listing_description":"b"}'::jsonb)$q$, '22023');
SELECT pg_temp.expect_error('manual deal rejects several units directly as sold',
  $q$SELECT public.create_manual_deal('{"asin":"MANUAL0002","title":"t","buy_price":1,"target_sell_price":2,"quantity":2,"status":"sold","listing_title":"a","listing_description":"b"}'::jsonb)$q$, '22023');
SELECT pg_temp.expect_error('two manual pending deals for the same product conflict',
  $q$SELECT public.create_manual_deal('{"asin":"MANUAL0003","title":"t","buy_price":1,"target_sell_price":2,"listing_title":"a","listing_description":"b"}'::jsonb),
            public.create_manual_deal('{"asin":"MANUAL0003","title":"t","buy_price":1,"target_sell_price":2,"listing_title":"a","listing_description":"b"}'::jsonb)$q$, '23505');

CREATE TEMP TABLE m2 AS SELECT public.create_manual_deal(jsonb_build_object(
  'asin', 'MANUAL0004', 'title', 'Already sold', 'buy_price', 10, 'target_sell_price', 30, 'status', 'sold',
  'actual_sell_price', 28, 'shipping_and_prep_cost', 5, 'platform_fees', 1, 'actual_profit', 12,
  'listing_title', 'LT', 'listing_description', 'LD')) AS j;
SELECT pg_temp.ok('a manual deal entered as sold writes its sale event',
  (SELECT amount || '/' || shipping_cost || '/' || platform_fees FROM public.sale_events
    WHERE opportunity_id = ((SELECT j->'opportunity_ids'->>0 FROM m2))::uuid) = '28.00/5.00/1.00');

-- update_manual_deal
CREATE TEMP TABLE m3 AS SELECT ((j->'opportunity_ids'->>0))::uuid AS id FROM m1;
UPDATE public.opportunities SET purchased_at = '2026-09-10T00:00:00Z', order_ref = 'ORDER-1', return_by = '2026-10-10'
 WHERE id = (SELECT id FROM m3);

SELECT public.update_manual_deal((SELECT id FROM m3), jsonb_build_object(
  'asin', 'MANUAL0001', 'title', 'Manual item (edited)', 'buy_price', 21, 'target_sell_price', 46, 'status', 'listed',
  'listing_title', 'LT2', 'listing_description', 'LD2', 'actor', '00000000-0000-0000-0000-0000000000a1'));

SELECT pg_temp.ok('update replaces the editable fields',
  (SELECT buy_price || ':' || status FROM public.opportunities WHERE id = (SELECT id FROM m3)) = '21.00:listed');
SELECT pg_temp.ok('update keeps lifecycle columns whose key is absent (purchased_at, order_ref, return_by, actual price)',
  (SELECT purchased_at IS NOT NULL AND order_ref = 'ORDER-1' AND return_by IS NOT NULL AND purchase_price_actual = 19.5
     FROM public.opportunities WHERE id = (SELECT id FROM m3)));
SELECT pg_temp.ok('update rewrites the single listing',
  (SELECT count(*) || generated_title FROM public.generated_listings WHERE opportunity_id = (SELECT id FROM m3) GROUP BY generated_title) = '1LT2');
SELECT public.update_manual_deal((SELECT id FROM m3), jsonb_build_object(
  'asin', 'MANUAL0001', 'title', 'Manual item (edited)', 'buy_price', 21, 'target_sell_price', 46, 'status', 'listed',
  'listing_title', 'LT2', 'listing_description', 'LD2', 'order_ref', NULL));
SELECT pg_temp.ok('update with the key present can clear a lifecycle column',
  (SELECT order_ref IS NULL FROM public.opportunities WHERE id = (SELECT id FROM m3)));

SELECT pg_temp.expect_error('update of an unknown id -> not found',
  $q$SELECT public.update_manual_deal('99999999-0000-0000-0000-000000000000', '{"asin":"MANUAL0001","title":"t","buy_price":1,"target_sell_price":2,"listing_title":"a","listing_description":"b"}'::jsonb)$q$, 'P0002');
SELECT pg_temp.expect_error('a sold deal cannot be moved back by editing',
  format($q$SELECT public.update_manual_deal(%L, '{"asin":"MANUAL0004","title":"t","buy_price":10,"target_sell_price":30,"status":"listed","listing_title":"a","listing_description":"b"}'::jsonb)$q$,
         (SELECT j->'opportunity_ids'->>0 FROM m2)), '55000');
SELECT pg_temp.expect_error('recorded sale amounts cannot be edited on a sold deal',
  format($q$SELECT public.update_manual_deal(%L, '{"asin":"MANUAL0004","title":"t","buy_price":10,"target_sell_price":30,"status":"sold","actual_sell_price":99,"listing_title":"a","listing_description":"b"}'::jsonb)$q$,
         (SELECT j->'opportunity_ids'->>0 FROM m2)), '55000');
SELECT pg_temp.ok('editing other fields of a sold deal is fine',
  (SELECT count(*) FROM (SELECT public.update_manual_deal(((SELECT j->'opportunity_ids'->>0 FROM m2))::uuid,
    '{"asin":"MANUAL0004","title":"Already sold (renamed)","buy_price":10,"target_sell_price":30,"status":"sold","actual_sell_price":28,"shipping_and_prep_cost":5,"platform_fees":1,"listing_title":"a","listing_description":"b"}'::jsonb)) x) = 1);

-- =============================================================================
-- 7. Sale, return, second sale
-- =============================================================================

CREATE TEMP TABLE u AS SELECT ((j->'opportunity_ids'->>1))::uuid AS id FROM m1;
UPDATE public.opportunities SET status = 'listed', listed_at = now() - interval '10 days', is_quarantine = false, product_condition = 'NEW'
 WHERE id = (SELECT id FROM u);

SELECT pg_temp.expect_error('a pending deal cannot be sold',
  format($q$SELECT public.record_sale(%L, '{"amount":10}'::jsonb)$q$, (SELECT (j->>'opportunity_id') FROM r3)), '55000');
SELECT pg_temp.expect_error('sale needs an amount', format($q$SELECT public.record_sale(%L, '{}'::jsonb)$q$, (SELECT id FROM u)), '22023');
SELECT pg_temp.expect_error('sale of an unknown deal -> not found',
  $q$SELECT public.record_sale('99999999-0000-0000-0000-000000000000', '{"amount":10}'::jsonb)$q$, 'P0002');

CREATE TEMP TABLE s1 AS SELECT public.record_sale((SELECT id FROM u), jsonb_build_object(
  'amount', 44.90, 'shipping_cost', 6.90, 'platform_fees', 0, 'actual_profit', 15.4, 'sold_during_event', 'Black Friday',
  'customer_inquiries_count', 4, 'actor', '00000000-0000-0000-0000-0000000000a1')) AS j;

SELECT pg_temp.ok('record_sale moves the unit to sold with the ledger event',
  (SELECT status FROM public.opportunities WHERE id = (SELECT id FROM u)) = 'sold'
  AND (SELECT amount FROM public.sale_events WHERE id = (SELECT (j->>'sale_event_id')::uuid FROM s1)) = 44.90);
SELECT pg_temp.ok('time_to_sell is measured from listed_at (10 days), not from created_at',
  (SELECT (j->>'time_to_sell_days')::int FROM s1) = 10
  AND (SELECT time_to_sell_days FROM public.opportunities WHERE id = (SELECT id FROM u)) = 10);
SELECT pg_temp.ok('legacy actual_* columns are filled for compatibility',
  (SELECT actual_sell_price || '/' || actual_profit || '/' || shipping_and_prep_cost FROM public.opportunities WHERE id = (SELECT id FROM u)) = '44.90/15.40/6.90');
SELECT pg_temp.expect_error('a sold deal cannot be sold again',
  format($q$SELECT public.record_sale(%L, '{"amount":10}'::jsonb)$q$, (SELECT id FROM u)), '55000');

SELECT pg_temp.expect_error('refund above what was paid is refused',
  format($q$SELECT public.record_return(%L, '{"refund_amount":100}'::jsonb)$q$, (SELECT id FROM u)), '22023');
SELECT pg_temp.expect_error('only a sold deal can be returned',
  format($q$SELECT public.record_return(%L, '{}'::jsonb)$q$, (SELECT (j->>'opportunity_id') FROM r3)), '55000');

CREATE TEMP TABLE t1 AS SELECT target_sell_price AS target FROM public.opportunities WHERE id = (SELECT id FROM u);
CREATE TEMP TABLE ret1 AS SELECT public.record_return((SELECT id FROM u),
  '{"return_shipping_cost": 3.20, "note": "Customer changed their mind"}'::jsonb) AS j;

SELECT pg_temp.ok('return writes a negative refund event; the sale event stays',
  (SELECT amount FROM public.sale_events WHERE id = (SELECT (j->>'refund_event_id')::uuid FROM ret1)) = -44.90
  AND (SELECT count(*) FROM public.sale_events WHERE opportunity_id = (SELECT id FROM u) AND event_type = 'sale') = 1);
SELECT pg_temp.ok('return records the return shipping cost on the refund',
  (SELECT shipping_cost FROM public.sale_events WHERE id = (SELECT (j->>'refund_event_id')::uuid FROM ret1)) = 3.20);
SELECT pg_temp.ok('returned unit is back in inventory, in quarantine, REVIEW NEEDED',
  (SELECT status || ':' || is_quarantine || ':' || product_condition FROM public.opportunities WHERE id = (SELECT id FROM u)) = 'in_inventory:true:REVIEW NEEDED');
SELECT pg_temp.ok('return keeps the original target_sell_price (no silent 10% cut)',
  (SELECT target_sell_price FROM public.opportunities WHERE id = (SELECT id FROM u)) = (SELECT target FROM t1));
SELECT pg_temp.ok('return resets sold_at and the stale sale-outcome columns',
  (SELECT sold_at IS NULL AND actual_sell_price IS NULL AND actual_profit IS NULL AND listed_at IS NULL
     FROM public.opportunities WHERE id = (SELECT id FROM u)));
SELECT pg_temp.ok('net ledger for the unit after the full refund is zero',
  (SELECT sum(amount) FROM public.sale_events WHERE opportunity_id = (SELECT id FROM u)) = 0);
SELECT pg_temp.expect_error('a returned unit cannot be returned again',
  format($q$SELECT public.record_return(%L, '{}'::jsonb)$q$, (SELECT id FROM u)), '55000');

UPDATE public.opportunities SET is_quarantine = false, product_condition = 'OPEN BOX', status = 'listed', listed_at = now() - interval '2 days'
 WHERE id = (SELECT id FROM u);
CREATE TEMP TABLE s2 AS SELECT public.record_sale((SELECT id FROM u), '{"amount": 39.00, "shipping_cost": 6.90}'::jsonb) AS j;
SELECT pg_temp.ok('after a return the unit can be sold again; the ledger nets both sales and the refund',
  (SELECT sum(amount) FROM public.sale_events WHERE opportunity_id = (SELECT id FROM u)) = 39.00
  AND (SELECT count(*) FROM public.sale_events WHERE opportunity_id = (SELECT id FROM u)) = 3
  AND (SELECT (j->>'time_to_sell_days')::int FROM s2) = 2);

CREATE TEMP TABLE ret2 AS SELECT public.record_return((SELECT id FROM u), '{"refund_amount": 10}'::jsonb) AS j;
SELECT pg_temp.ok('a partial refund is supported',
  (SELECT sum(amount) FROM public.sale_events WHERE opportunity_id = (SELECT id FROM u)) = 29.00);

-- =============================================================================
-- 8. Audit log
-- =============================================================================

SELECT pg_temp.ok('the audit log recorded the status change to sold with old and new value',
  EXISTS (SELECT 1 FROM public.audit_log
           WHERE table_name = 'opportunities' AND row_id = (SELECT id FROM u) AND action = 'UPDATE'
             AND old_row ->> 'status' = 'listed' AND new_row ->> 'status' = 'sold'));
SELECT pg_temp.ok('the audit entry carries the acting admin from the RPC payload',
  EXISTS (SELECT 1 FROM public.audit_log
           WHERE row_id = (SELECT id FROM u) AND new_row ->> 'status' = 'sold'
             AND changed_by = '00000000-0000-0000-0000-0000000000a1'));
SELECT pg_temp.ok('the audit diff only holds the changed columns',
  NOT EXISTS (SELECT 1 FROM public.audit_log WHERE row_id = (SELECT id FROM u) AND new_row ? 'sku'));
SELECT pg_temp.ok('the audit log recorded the return',
  EXISTS (SELECT 1 FROM public.audit_log
           WHERE row_id = (SELECT id FROM u) AND old_row ->> 'status' = 'sold' AND new_row ->> 'status' = 'in_inventory'));

UPDATE public.opportunities SET willhaben_url = 'https://www.willhaben.at/iad/x' WHERE sku = 'SMOKE-3';
SELECT pg_temp.ok('a willhaben_url change is audited',
  EXISTS (SELECT 1 FROM public.audit_log WHERE new_row ->> 'willhaben_url' = 'https://www.willhaben.at/iad/x'));

UPDATE public.opportunities SET warehouse_location = 'ZZ9' WHERE sku = 'SMOKE-3';
SELECT pg_temp.ok('changing an unwatched column writes no audit entry',
  NOT EXISTS (SELECT 1 FROM public.audit_log WHERE new_row ? 'warehouse_location'));

INSERT INTO public.opportunities (id, product_id, buy_price, status, sku)
VALUES ('22222222-0000-0000-0000-0000000000d1', '11111111-0000-0000-0000-000000000002', 5, 'cancelled', 'SMOKE-DEL');
DELETE FROM public.opportunities WHERE id = '22222222-0000-0000-0000-0000000000d1';
SELECT pg_temp.ok('deleting an unsold unit is allowed and its full row is kept in the audit log',
  EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'DELETE' AND row_id = '22222222-0000-0000-0000-0000000000d1' AND old_row ->> 'sku' = 'SMOKE-DEL'));

SELECT pg_temp.expect_error('audit_log cannot be written by the browser role',
  $q$INSERT INTO public.audit_log (table_name, action) VALUES ('x', 'UPDATE')$q$, '42501', 'authenticated');

DO $$ BEGIN RAISE NOTICE 'ALL CHECKS PASSED'; END $$;
ROLLBACK;
