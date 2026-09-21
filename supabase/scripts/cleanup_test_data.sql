-- =====================================================================================
-- cleanup_test_data.sql: remove TEST records (old mock scans, test sales) by hand.
--
-- THIS IS NOT A MIGRATION. It lives in supabase/scripts/, is never applied by
-- `supabase db push`, `db reset` or CI, and it changes nothing until the owner edits the
-- three marked lines and runs PART 2 on purpose. Step-by-step guide (Turkish, click by
-- click): docs/MANUEL-ADIMLAR.md, item "Test verisi temizligi".
--
-- Why it exists
--   Scans made before the pipeline rewrite ran in mock mode and left rows titled
--   "Test Product for ASIN: ..." that show up on the public storefront. Some of them may
--   have a test sale. The database refuses to delete a sold unit or a sale_events row
--   (tax records: see 20260921090200 and 20260921090300), so the application cannot clean
--   this up. This script is the one deliberate exception.
--
-- DO NOT use it for a real sale. A real sale is a bookkeeping record that has to be
-- kept (about 7 years, BAO 132). For a real sale use Returned in the app (refund event).
--
-- Safety design
--   * PART 1 only reads.
--   * PART 2 is ONE statement (a DO block = one transaction) and does nothing durable by
--     default: v_commit is false, the block ends by raising an error whose text is the
--     report, and PostgreSQL undoes everything. The trailing COMMIT after an aborted
--     block is a rollback.
--   * It only touches products whose ASIN is in the owner's list AND (by default) whose
--     title contains "Test Product for ASIN". Anything else in the list stops the run.
--     At most v_max_units units; the whole list must match or nothing happens.
--   * The two guard triggers (sale_events append-only, protect sold units) are switched
--     off only inside the block, only the delete statements below run while they are off
--     and every one of them is filtered by the ids selected from the list; the guards are
--     switched on again and checked before the block ends. DDL is transactional, so a
--     failure or the dry run puts them back on by itself. While the guards are off the two
--     tables are locked against other writers.
--   * The audit trail: the `opportunities_audit` trigger stays on and logs every deleted
--     unit with its full row; the sale_events rows (no trigger) are copied into one extra
--     audit_log row (table_name 'cleanup_test_data') before they are deleted.
--   * Products (and their price_history) are removed only together with all their units.
--   * scan_jobs rows are kept (their opportunity_id becomes NULL); they are only history.
--
-- Where to run: Supabase Dashboard -> SQL Editor (role postgres). Never run it against a
-- database you have not backed up first.
-- =====================================================================================


-- =====================================================================================
-- PART 1: LOOK. Read-only. Select ONE query at a time (drag over it) and press Run.
-- =====================================================================================

-- 1a. Products that look like test data, with the number of units and whether any unit
--     has a recorded sale.
SELECT p.asin,
       p.title,
       count(o.id)                                                        AS units,
       count(o.id) FILTER (WHERE o.status = 'sold')                       AS sold_units,
       count(o.id) FILTER (WHERE o.deleted_at IS NOT NULL)                AS hidden_units,
       (SELECT count(*) FROM public.sale_events s
         WHERE s.opportunity_id IN (SELECT id FROM public.opportunities WHERE product_id = p.id)) AS sale_rows,
       min(o.created_at)::date                                            AS first_seen
  FROM public.products p
  LEFT JOIN public.opportunities o ON o.product_id = p.id
 WHERE p.title ILIKE '%Test Product for ASIN%'
    OR p.title ILIKE '[MOCK]%'
 GROUP BY p.id, p.asin, p.title
 ORDER BY first_seen, p.asin;

-- 1b. EVERY sale or refund in the database, with its product. Look at this one carefully:
--     if a row here is a REAL sale, its ASIN must NOT go on the list.
SELECT p.asin,
       p.title,
       s.event_type,
       s.amount,
       s.occurred_at::date AS on_day,
       s.note,
       o.status            AS unit_status,
       o.id                AS unit_id
  FROM public.sale_events s
  JOIN public.opportunities o ON o.id = s.opportunity_id
  JOIN public.products p      ON p.id = o.product_id
 ORDER BY s.occurred_at;

-- 1c. What the public can see right now from those products (this is what disappears from
--     the storefront). Empty result = nothing of it is visible.
SELECT v.*
  FROM public.storefront_listings v
 WHERE v.id IN (SELECT o.id
                  FROM public.opportunities o
                  JOIN public.products p ON p.id = o.product_id
                 WHERE p.title ILIKE '%Test Product for ASIN%' OR p.title ILIKE '[MOCK]%');


-- =====================================================================================
-- PART 2: DELETE (dry run by default). Edit ONLY the three lines marked  <== EDIT.
--   Step A: put your ASINs into v_asins, leave v_commit false, run it. You get an
--           ERROR that starts with "DRY RUN OK". That is the report; nothing was changed.
--   Step B: happy with the report? Set v_commit := true and v_confirm := 'DELETE TEST DATA'
--           and run it again. No error = done. Then re-run 1a/1b/1c of PART 1.
-- =====================================================================================

BEGIN;

DO $cleanup$
DECLARE
  v_asins              text[]  := ARRAY['B0EXAMPLE00'];   -- <== EDIT: ASINs of TEST products, e.g. ARRAY['B0AAAAAAA1','B0BBBBBBB2']
  v_commit             boolean := false;                  -- <== EDIT: false = dry run (everything is undone), true = keep the changes
  v_confirm            text    := '';                     -- <== EDIT: must be 'DELETE TEST DATA' when v_commit is true

  v_require_test_title boolean := true;   -- true: only products titled "... Test Product for ASIN ..."; false only if you know why
  v_max_units          int     := 25;     -- refuse to touch more units than this

  v_product_ids uuid[];
  v_opp_ids     uuid[];
  v_unmatched   text[];
  v_n_products  int;
  v_n_units     int;
  v_n_sold      int;
  v_n_sales     int;
  v_n_listings  int;
  v_n_prices    int;
  v_sales_json  jsonb;
  v_guards_off  int;
  v_report      text;
BEGIN
  -- ---- 1. Input checks ---------------------------------------------------------------
  IF coalesce(cardinality(v_asins), 0) = 0 THEN
    RAISE EXCEPTION 'v_asins is empty: nothing to do.';
  END IF;
  IF 'B0EXAMPLE00' = ANY (v_asins) THEN
    RAISE EXCEPTION 'v_asins still contains the example ASIN B0EXAMPLE00: put your own ASINs there.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_asins) AS a WHERE a !~ '^[A-Z0-9]{10}$') THEN
    RAISE EXCEPTION 'Every ASIN must be exactly 10 capital letters/digits. Check v_asins: %', v_asins;
  END IF;
  IF v_commit AND v_confirm IS DISTINCT FROM 'DELETE TEST DATA' THEN
    RAISE EXCEPTION 'v_commit is true but v_confirm is not exactly ''DELETE TEST DATA''. Nothing was changed.';
  END IF;

  -- ---- 2. Select: only what the list names, never more --------------------------------
  SELECT coalesce(array_agg(p.id), '{}')
    INTO v_product_ids
    FROM public.products p
   WHERE p.asin = ANY (v_asins)
     AND (NOT v_require_test_title OR p.title ILIKE '%Test Product for ASIN%');

  SELECT coalesce(array_agg(a), '{}')
    INTO v_unmatched
    FROM unnest(v_asins) AS a
   WHERE NOT EXISTS (SELECT 1 FROM public.products p
                      WHERE p.asin = a AND p.id = ANY (v_product_ids));
  IF cardinality(v_unmatched) > 0 THEN
    RAISE EXCEPTION 'No test product found for ASIN(s) % (typo, already removed, or the title does not contain "Test Product for ASIN"). Nothing was changed.', v_unmatched;
  END IF;

  SELECT coalesce(array_agg(o.id), '{}'),
         count(*),
         count(*) FILTER (WHERE o.status = 'sold')
    INTO v_opp_ids, v_n_units, v_n_sold
    FROM public.opportunities o
   WHERE o.product_id = ANY (v_product_ids);

  IF v_n_units > v_max_units THEN
    RAISE EXCEPTION 'The list matches % units, more than v_max_units (%). Nothing was changed. Check the list.', v_n_units, v_max_units;
  END IF;

  v_n_products := cardinality(v_product_ids);
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.occurred_at), '[]'::jsonb)
    INTO v_n_sales, v_sales_json
    FROM public.sale_events s
   WHERE s.opportunity_id = ANY (v_opp_ids);
  SELECT count(*) INTO v_n_listings FROM public.generated_listings WHERE opportunity_id = ANY (v_opp_ids);
  SELECT count(*) INTO v_n_prices   FROM public.price_history     WHERE product_id     = ANY (v_product_ids);

  -- ---- 3. Delete with the two guards off, then put them back --------------------------
  ALTER TABLE public.sale_events   DISABLE TRIGGER sale_events_no_update_delete;
  ALTER TABLE public.opportunities DISABLE TRIGGER opportunities_protect_sold_delete;

  -- Audit note first: the sale_events rows have no trigger of their own.
  INSERT INTO public.audit_log (table_name, row_id, action, old_row, new_row, changed_by)
  VALUES ('cleanup_test_data', NULL, 'DELETE',
          jsonb_build_object('asins', to_jsonb(v_asins), 'unit_ids', to_jsonb(v_opp_ids),
                             'sale_events', v_sales_json),
          jsonb_build_object('note', 'manual test-data cleanup (supabase/scripts/cleanup_test_data.sql)',
                             'committed', v_commit, 'at', now(),
                             'products', v_n_products, 'units', v_n_units, 'sale_rows', v_n_sales),
          NULL);

  DELETE FROM public.sale_events   WHERE opportunity_id = ANY (v_opp_ids);
  DELETE FROM public.opportunities WHERE id            = ANY (v_opp_ids);   -- audit trigger logs each unit; listings cascade
  DELETE FROM public.products      WHERE id            = ANY (v_product_ids); -- price_history cascades

  ALTER TABLE public.sale_events   ENABLE TRIGGER sale_events_no_update_delete;
  ALTER TABLE public.opportunities ENABLE TRIGGER opportunities_protect_sold_delete;

  -- Belt and braces: both guards must be on again, or the whole thing is undone.
  SELECT count(*) INTO v_guards_off
    FROM pg_trigger t
   WHERE t.tgname IN ('sale_events_no_update_delete', 'opportunities_protect_sold_delete')
     AND t.tgrelid IN ('public.sale_events'::regclass, 'public.opportunities'::regclass)
     AND t.tgenabled <> 'O';
  IF v_guards_off > 0 THEN
    RAISE EXCEPTION 'A protection trigger is still switched off: everything is undone.';
  END IF;

  -- ---- 4. Report -----------------------------------------------------------------------
  v_report := format('%s product(s), %s unit(s) (%s of them sold), %s sale/refund row(s), %s listing text(s), %s price point(s); ASINs: %s',
                     v_n_products, v_n_units, v_n_sold, v_n_sales, v_n_listings, v_n_prices, array_to_string(v_asins, ', '));

  IF NOT v_commit THEN
    RAISE EXCEPTION 'DRY RUN OK, nothing was changed. This is what WOULD be removed: %. To do it for real set v_commit := true and v_confirm := ''DELETE TEST DATA''.', v_report;
  END IF;

  RAISE NOTICE 'REMOVED: %', v_report;
END
$cleanup$;

-- Reached in the same script only when the DO block succeeded (v_commit = true).
-- After the dry-run error, PostgreSQL treats this COMMIT as a ROLLBACK.
COMMIT;
