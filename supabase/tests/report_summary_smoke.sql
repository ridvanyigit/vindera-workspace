-- =============================================================================
-- Smoke test for report_summary(year): the accounting figures, checked against a
-- hand calculation
-- =============================================================================
-- Run against the LOCAL database only, after `supabase db reset`:
--
--   docker exec -i supabase_db_vindera-workspace psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/report_summary_smoke.sql
--
-- One transaction, rolled back at the end. Every check prints "PASS <label>"; the
-- first failure aborts with "FAIL <label>" and a non-zero exit.
--
-- Scenario (docs/MANUAL-TEST-SCRIPT.md, plus a unit that crosses the year border):
--
--   Unit A  paid 20.00 + 2.00 inbound + 1.00 packaging = cost 23.00, bought 2026-03-01
--           2026-03-05 sale 60.00 (shipping 6.90)
--           2026-03-09 refund -60.00 (return shipping 4.50)     -> the sale is reversed
--           2026-03-20 sale 70.00 (shipping 5.00, fees 1.50)
--   Unit B  cost 50.00, bought 2025-12-15
--           sale 99.00 at 2025-12-31 23:30 UTC = 2026-01-01 00:30 in Vienna -> counts in 2026
--   Expense 10.00 "Storage" on 2026-04-01
--
-- Expected 2026, management view:
--   revenue        70 + 99                       = 169.00
--   COGS           23 - 23 + 23 + 50             =  73.00   (a refund gives the cost back)
--   shipping       6.90 + 4.50 + 5.00            =  16.40
--   fees                                            1.50
--   gross profit   169 - 73 - 16.40 - 1.50       =  78.10
--   before tax     78.10 - 10                    =  68.10
--   units sold     1 - 1 + 1 + 1                 =   2
--   ROI            78.10 / 73                    = 106.99 %
--   VAT progress   169 / 55000                   =   0.31 %
-- Expected 2026, cash (E/A) view: income 169.00, purchases 23.00 (B was bought in
-- 2025), other outgoings 27.90 (16.40 + 1.50 + 10), result 118.10.
-- Expected 2025, cash view: purchases 50.00, result -50.00, no income.
-- =============================================================================

BEGIN;

CREATE FUNCTION pg_temp.ok(p_label text, p_condition boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_condition IS TRUE THEN
    RAISE NOTICE 'PASS %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL %', p_label;
  END IF;
END $$;

UPDATE public.business_settings SET vat_threshold_eur = 55000, vat_warn_pct = 80 WHERE id = 1;

INSERT INTO public.products (id, asin, amazon_locale, title, category) VALUES
  ('33333333-0000-0000-0000-000000000001', 'REPORTASN1', 'DE', 'Report unit A', 'Other'),
  ('33333333-0000-0000-0000-000000000002', 'REPORTASN2', 'DE', 'Report unit B', 'Other');

INSERT INTO public.opportunities
  (id, product_id, status, sku, buy_price, purchase_price_actual, inbound_shipping_cost, packaging_cost, purchased_at, sold_at)
VALUES
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'sold', 'REPORT-A',
   20, 20, 2, 1, '2026-03-01 09:00+01', '2026-03-20 10:00+01'),
  ('44444444-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002', 'sold', 'REPORT-B',
   50, 50, 0, 0, '2025-12-15 09:00+01', '2026-01-01 00:30+01');

INSERT INTO public.sale_events (opportunity_id, event_type, amount, shipping_cost, platform_fees, occurred_at) VALUES
  ('44444444-0000-0000-0000-000000000001', 'sale',    60.00, 6.90, 0.00, '2026-03-05 10:00+01'),
  ('44444444-0000-0000-0000-000000000001', 'refund', -60.00, 4.50, 0.00, '2026-03-09 10:00+01'),
  ('44444444-0000-0000-0000-000000000001', 'sale',    70.00, 5.00, 1.50, '2026-03-20 10:00+01'),
  ('44444444-0000-0000-0000-000000000002', 'sale',    99.00, 0.00, 0.00, '2025-12-31 23:30+00');

INSERT INTO public.business_expenses (incurred_at, description, category, amount)
VALUES ('2026-04-01', 'Storage', 'Other', 10.00);

CREATE TEMP TABLE r26 AS SELECT public.report_summary(2026) AS r;
CREATE TEMP TABLE r25 AS SELECT public.report_summary(2025) AS r;
CREATE TEMP TABLE r24 AS SELECT public.report_summary(2024) AS r;

-- --- 2026, management view ----------------------------------------------------------
SELECT pg_temp.ok('2026 revenue 169.00',          (SELECT (r->'management'->>'revenue')::numeric = 169.00 FROM r26));
SELECT pg_temp.ok('2026 COGS 73.00 (refund gives the cost back)', (SELECT (r->'management'->>'cogs')::numeric = 73.00 FROM r26));
SELECT pg_temp.ok('2026 shipping 16.40',          (SELECT (r->'management'->>'shipping')::numeric = 16.40 FROM r26));
SELECT pg_temp.ok('2026 platform fees 1.50',      (SELECT (r->'management'->>'platform_fees')::numeric = 1.50 FROM r26));
SELECT pg_temp.ok('2026 gross profit 78.10',      (SELECT (r->'management'->>'gross_profit')::numeric = 78.10 FROM r26));
SELECT pg_temp.ok('2026 expenses 10.00',          (SELECT (r->'management'->>'expenses_total')::numeric = 10.00 FROM r26));
SELECT pg_temp.ok('2026 profit before tax 68.10', (SELECT (r->'management'->>'profit_before_tax')::numeric = 68.10 FROM r26));
SELECT pg_temp.ok('2026 units sold 2 (sale, refund, sale, sale)', (SELECT (r->'management'->>'units_sold')::int = 2 FROM r26));
SELECT pg_temp.ok('2026 ROI 106.99',              (SELECT (r->'management'->>'roi_pct')::numeric = 106.99 FROM r26));
SELECT pg_temp.ok('2026 monthly series: always 12 months, January 99.00, March 70.00, the rest 0',
  (SELECT jsonb_array_length(r->'management'->'monthly') = 12
      AND (SELECT (m->>'revenue')::numeric FROM jsonb_array_elements(r->'management'->'monthly') m WHERE (m->>'month')::int = 1) = 99.00
      AND (SELECT (m->>'revenue')::numeric FROM jsonb_array_elements(r->'management'->'monthly') m WHERE (m->>'month')::int = 3) = 70.00
      AND (SELECT sum((m->>'revenue')::numeric) FROM jsonb_array_elements(r->'management'->'monthly') m) = 169.00 FROM r26));
SELECT pg_temp.ok('2026 one category row with the full revenue',
  (SELECT jsonb_array_length(r->'management'->'by_category') = 1
      AND (r->'management'->'by_category'->0->>'revenue')::numeric = 169.00 FROM r26));

-- --- 2026, cash (E/A) view ------------------------------------------------------------
SELECT pg_temp.ok('2026 cash income 169.00',      (SELECT (r->'cash'->>'income')::numeric = 169.00 FROM r26));
SELECT pg_temp.ok('2026 cash purchases 23.00 (unit B was bought in 2025)', (SELECT (r->'cash'->>'purchases')::numeric = 23.00 FROM r26));
SELECT pg_temp.ok('2026 cash result 118.10',      (SELECT (r->'cash'->>'result')::numeric = 118.10 FROM r26));

-- --- VAT threshold uses the calendar year --------------------------------------------------
SELECT pg_temp.ok('2026 VAT progress 0.31 % of 55000',
  (SELECT (r->'vat'->>'pct')::numeric = 0.31 AND (r->'vat'->>'threshold')::numeric = 55000 FROM r26));
SELECT pg_temp.ok('2025 VAT progress 0 (not all-time)', (SELECT (r->'vat'->>'pct')::numeric = 0 FROM r25));

-- --- 2025 and an empty year ---------------------------------------------------------------------
SELECT pg_temp.ok('2025 has no revenue (the border sale belongs to 2026 in Vienna)',
  (SELECT (r->'management'->>'revenue')::numeric = 0 FROM r25));
SELECT pg_temp.ok('2025 cash purchases 50.00 and result -50.00',
  (SELECT (r->'cash'->>'purchases')::numeric = 50.00 AND (r->'cash'->>'result')::numeric = -50.00 FROM r25));
SELECT pg_temp.ok('an empty year is all zero',
  (SELECT (r->'management'->>'revenue')::numeric = 0 AND (r->'management'->>'cogs')::numeric = 0
      AND (r->'cash'->>'result')::numeric = 0 FROM r24));
SELECT pg_temp.ok('available years list both years with data',
  (SELECT r->'available_years' @> '[2026, 2025]'::jsonb FROM r26));

-- --- access -----------------------------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM public.report_summary(2026);
  RESET ROLE;
  RAISE EXCEPTION 'FAIL authenticated must not run report_summary';
EXCEPTION WHEN insufficient_privilege THEN
  RESET ROLE;
  RAISE NOTICE 'PASS authenticated cannot run report_summary';
END $$;

ROLLBACK;
