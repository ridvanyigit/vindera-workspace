-- =============================================================================
-- Atomic write functions (RPC) for the FastAPI backend
-- =============================================================================
-- Why (launch-hardening audit):
--   D4  A scan or a manual deal wrote several tables in separate calls. If the
--       second insert failed, the first stayed behind (a product with no
--       opportunity, an opportunity with no listing, a sale with no record).
--   C6  "Returned" had no ledger entry; C7 "bought" recorded nothing real.
--
-- Each function below runs in ONE transaction, so it either happens completely
-- or not at all. They are called by the backend as
--     supabase.rpc('<name>', {'payload': {...}})          (record_* / update_*: plus 'p_id')
-- and are executable ONLY by the service role: EXECUTE is revoked from PUBLIC,
-- anon and authenticated, so the browser can never call them.
--
-- The payload keys are the contract with the Python models (Phases 3 and 4).
-- Money math is NOT done here: the backend's profit calculator computes
-- profit_margin / net_profit_estimate / net_margin_estimate / actual_profit and
-- passes them in; these functions only store them.
--
-- Common optional key in every payload:
--   actor  uuid   the admin performing the action; recorded in audit_log.changed_by
--
-- ERROR CODES (SQLSTATE), so the backend can map them to HTTP statuses:
--   22023  invalid payload                      -> 422
--   P0002  opportunity not found / deleted      -> 404
--   55000  action not allowed in current state  -> 409
--   23505  unique violation (SKU, open scan)    -> 409
--
-- ----------------------------------------------------------------------------
-- persist_scan_result(payload)                                   -> jsonb
--   asin*, amazon_locale ('DE'), title*, category ('Other'), image_url,
--   status* ('pending' | 'rejected'), buy_price*, target_sell_price,
--   profit_margin, net_profit_estimate, net_margin_estimate, emergency_sell_price,
--   ai_decision, buybox_seller, buybox_is_fba, deal_score, holding_period_months,
--   seasonality_analysis, score_breakdown (object), willhaben_realistic_price,
--   purchase_thesis, warehouse_location ('A01'), sku (generated),
--   listing {generated_title, generated_description, target_platform, language},
--   price_history [{recorded_at, price_amazon, price_buybox, is_deal}] (max 500),
--   job_id (scan_jobs row to close in the same transaction)
--   Upserts the product, then REFRESHES the open (pending/rejected) row for that
--   product or inserts one, updates/creates the listing, adds the price points.
--   Returns {opportunity_id, product_id, sku, created, status}.
--
-- create_manual_deal(payload)                                    -> jsonb
--   Same fields as the backend's ManualDealRequest plus: quantity (1-50, not with
--   status 'sold'), purchase_price_actual, purchased_at, order_ref,
--   inbound_shipping_cost, packaging_cost, received_at, listed_at, return_by,
--   profit_margin, net_profit_estimate, net_margin_estimate, sold_at,
--   actual_sell_price, actual_profit, shipping_and_prep_cost, platform_fees,
--   customer_inquiries_count, customer_messages_summary, sold_during_event,
--   time_to_sell_days, gallery_image_urls [text], listing_title*, listing_description*.
--   status 'sold' also writes the `sale` ledger event.
--   Returns {opportunity_ids, skus, product_id}.
--
-- update_manual_deal(p_id, payload)                              -> jsonb
--   Replaces every editable field (PUT semantics). The lifecycle cost columns
--   (purchase_price_actual ... return_by, profit estimates) are only changed when
--   their key is present, so an edit form that does not know them cannot wipe
--   what "Mark as Bought" recorded. A sold deal cannot be moved back or have its
--   recorded amounts changed here (ledger); use record_return + record_sale.
--   Returns {opportunity_id, product_id, sku}.
--
-- record_sale(p_id, payload)                                     -> jsonb
--   amount* (>= 0), shipping_cost, platform_fees, occurred_at (now), note,
--   actual_profit (computed by the backend), customer_inquiries_count,
--   customer_messages_summary, sold_during_event.
--   Allowed from bought / in_inventory / listed. Writes the `sale` event, sets
--   status 'sold', sold_at, time_to_sell_days (from listed_at, else purchased_at,
--   else created_at) and the legacy actual_* columns.
--   Returns {opportunity_id, sale_event_id, sold_at, time_to_sell_days}.
--
-- record_return(p_id, payload)                                   -> jsonb
--   refund_amount (default: everything still retained), return_shipping_cost (0),
--   occurred_at (now), note.
--   Allowed from sold only. Writes the `refund` event FIRST, then moves the unit
--   back to in_inventory in quarantine ('REVIEW NEEDED'), keeps target_sell_price,
--   and resets sold_at, listed_at and the legacy sale-outcome columns (the sale
--   itself stays in sale_events; audit_log keeps the old column values).
--   Returns {opportunity_id, refund_event_id, refund_amount}.
--
-- Idempotent: safe to run more than once (CREATE OR REPLACE).
-- =============================================================================

-- --- Helper: an unused SKU -----------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."generate_sku"()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sku text;
BEGIN
  LOOP
    v_sku := 'GEN-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.opportunities WHERE sku = v_sku);
  END LOOP;
  RETURN v_sku;
END;
$$;

-- =============================================================================
-- persist_scan_result
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."persist_scan_result"(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asin        text := upper(btrim(payload ->> 'asin'));
  v_locale      text := COALESCE(NULLIF(payload ->> 'amazon_locale', ''), 'DE');
  v_title       text := btrim(payload ->> 'title');
  v_category    text := COALESCE(NULLIF(payload ->> 'category', ''), 'Other');
  v_status      text := COALESCE(payload ->> 'status', 'pending');
  v_listing     jsonb := NULLIF(payload -> 'listing', 'null'::jsonb);
  v_breakdown   jsonb := NULLIF(payload -> 'score_breakdown', 'null'::jsonb);
  v_job_id      uuid := NULLIF(payload ->> 'job_id', '')::uuid;
  v_product_id  uuid;
  v_opp_id      uuid;
  v_listing_id  uuid;
  v_sku         text;
  v_created     boolean := false;
BEGIN
  IF v_asin IS NULL OR v_asin !~ '^[A-Z0-9]{10}$' THEN
    RAISE EXCEPTION 'persist_scan_result: invalid asin' USING ERRCODE = '22023';
  END IF;
  IF v_title IS NULL OR v_title = '' THEN
    RAISE EXCEPTION 'persist_scan_result: title is required' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'persist_scan_result: status must be pending or rejected' USING ERRCODE = '22023';
  END IF;
  IF (payload ->> 'buy_price') IS NULL OR (payload ->> 'buy_price')::numeric <= 0 THEN
    RAISE EXCEPTION 'persist_scan_result: buy_price must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(payload -> 'price_history') = 'array'
     AND jsonb_array_length(payload -> 'price_history') > 500 THEN
    RAISE EXCEPTION 'persist_scan_result: too many price_history points' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('vindera.actor', COALESCE(payload ->> 'actor', ''), true);

  -- Two scans of the same ASIN must not race each other into two open rows.
  PERFORM pg_advisory_xact_lock(hashtextextended('scan:' || v_asin || ':' || v_locale, 0));

  INSERT INTO public.products (asin, amazon_locale, title, category, image_url)
  VALUES (v_asin, v_locale, v_title, v_category, NULLIF(payload ->> 'image_url', ''))
  ON CONFLICT (asin, amazon_locale) DO UPDATE
    SET title     = EXCLUDED.title,
        category  = EXCLUDED.category,
        image_url = COALESCE(EXCLUDED.image_url, public.products.image_url)
  RETURNING id INTO v_product_id;

  -- The open scan row for this product, if any (see opportunities_one_open_scan_per_product).
  SELECT o.id INTO v_opp_id
    FROM public.opportunities o
   WHERE o.product_id = v_product_id
     AND o.status IN ('pending', 'rejected')
     AND o.deleted_at IS NULL
   ORDER BY o.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_opp_id IS NOT NULL THEN
    -- Re-scan: refresh the scan-derived fields, keep everything else (SKU, location ...).
    UPDATE public.opportunities SET
      buy_price                 = (payload ->> 'buy_price')::numeric,
      target_sell_price         = COALESCE((payload ->> 'target_sell_price')::numeric, target_sell_price),
      profit_margin             = COALESCE((payload ->> 'profit_margin')::numeric, profit_margin),
      net_profit_estimate       = COALESCE((payload ->> 'net_profit_estimate')::numeric, net_profit_estimate),
      net_margin_estimate       = COALESCE((payload ->> 'net_margin_estimate')::numeric, net_margin_estimate),
      emergency_sell_price      = COALESCE((payload ->> 'emergency_sell_price')::numeric, emergency_sell_price),
      ai_decision               = COALESCE(payload ->> 'ai_decision', ai_decision),
      status                    = v_status,
      buybox_seller             = COALESCE(payload ->> 'buybox_seller', buybox_seller),
      buybox_is_fba             = COALESCE((payload ->> 'buybox_is_fba')::boolean, buybox_is_fba),
      deal_score                = COALESCE((payload ->> 'deal_score')::integer, deal_score),
      holding_period_months     = COALESCE((payload ->> 'holding_period_months')::integer, holding_period_months),
      seasonality_analysis      = COALESCE(payload ->> 'seasonality_analysis', seasonality_analysis),
      score_breakdown           = COALESCE(v_breakdown, score_breakdown),
      willhaben_realistic_price = COALESCE((payload ->> 'willhaben_realistic_price')::numeric, willhaben_realistic_price),
      purchase_thesis           = COALESCE(payload ->> 'purchase_thesis', purchase_thesis)
    WHERE id = v_opp_id;
    SELECT sku INTO v_sku FROM public.opportunities WHERE id = v_opp_id;
  ELSE
    v_sku := COALESCE(NULLIF(payload ->> 'sku', ''), public.generate_sku());
    INSERT INTO public.opportunities (
      product_id, buy_price, target_sell_price, profit_margin, net_profit_estimate,
      net_margin_estimate, emergency_sell_price, ai_decision, status, buybox_seller,
      buybox_is_fba, deal_score, holding_period_months, seasonality_analysis, sku,
      warehouse_location, product_condition, score_breakdown, willhaben_realistic_price,
      purchase_thesis
    ) VALUES (
      v_product_id,
      (payload ->> 'buy_price')::numeric,
      (payload ->> 'target_sell_price')::numeric,
      (payload ->> 'profit_margin')::numeric,
      (payload ->> 'net_profit_estimate')::numeric,
      (payload ->> 'net_margin_estimate')::numeric,
      (payload ->> 'emergency_sell_price')::numeric,
      payload ->> 'ai_decision',
      v_status,
      COALESCE(payload ->> 'buybox_seller', 'Unknown'),
      COALESCE((payload ->> 'buybox_is_fba')::boolean, false),
      COALESCE((payload ->> 'deal_score')::integer, 0),
      COALESCE((payload ->> 'holding_period_months')::integer, 0),
      payload ->> 'seasonality_analysis',
      v_sku,
      COALESCE(NULLIF(payload ->> 'warehouse_location', ''), 'A01'),
      'NEW',
      v_breakdown,
      (payload ->> 'willhaben_realistic_price')::numeric,
      payload ->> 'purchase_thesis'
    )
    RETURNING id INTO v_opp_id;
    v_created := true;
  END IF;

  IF v_listing IS NOT NULL AND jsonb_typeof(v_listing) = 'object' THEN
    SELECT id INTO v_listing_id
      FROM public.generated_listings
     WHERE opportunity_id = v_opp_id
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_listing_id IS NOT NULL THEN
      UPDATE public.generated_listings SET
        generated_title       = COALESCE(v_listing ->> 'generated_title', generated_title),
        generated_description = COALESCE(v_listing ->> 'generated_description', generated_description)
      WHERE id = v_listing_id;
    ELSE
      INSERT INTO public.generated_listings (
        opportunity_id, target_platform, language, generated_title, generated_description
      ) VALUES (
        v_opp_id,
        COALESCE(v_listing ->> 'target_platform', 'Willhaben'),
        COALESCE(v_listing ->> 'language', 'de'),
        v_listing ->> 'generated_title',
        v_listing ->> 'generated_description'
      );
    END IF;
  END IF;

  IF jsonb_typeof(payload -> 'price_history') = 'array' THEN
    INSERT INTO public.price_history (product_id, price_amazon, price_buybox, is_deal, recorded_at)
    SELECT v_product_id, x.price_amazon, x.price_buybox, COALESCE(x.is_deal, false), COALESCE(x.recorded_at, now())
      FROM jsonb_to_recordset(payload -> 'price_history')
        AS x (recorded_at timestamptz, price_amazon numeric, price_buybox numeric, is_deal boolean)
    ON CONFLICT (product_id, recorded_at) DO NOTHING;
  END IF;

  IF v_job_id IS NOT NULL THEN
    UPDATE public.scan_jobs SET
      status         = CASE WHEN v_status = 'rejected' THEN 'rejected' ELSE 'succeeded' END,
      opportunity_id = v_opp_id,
      error          = NULL,
      finished_at    = now()
    WHERE id = v_job_id;
  END IF;

  RETURN jsonb_build_object(
    'opportunity_id', v_opp_id,
    'product_id',     v_product_id,
    'sku',            v_sku,
    'created',        v_created,
    'status',         v_status
  );
END;
$$;

-- =============================================================================
-- create_manual_deal
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."create_manual_deal"(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asin        text := upper(btrim(payload ->> 'asin'));
  v_locale      text := COALESCE(NULLIF(payload ->> 'amazon_locale', ''), 'DE');
  v_title       text := btrim(payload ->> 'title');
  v_status      text := COALESCE(payload ->> 'status', 'pending');
  v_qty         integer := COALESCE((payload ->> 'quantity')::integer, 1);
  v_base_sku    text := NULLIF(btrim(payload ->> 'sku'), '');
  v_gallery     text[];
  v_breakdown   jsonb := NULLIF(payload -> 'score_breakdown', 'null'::jsonb);
  v_target      numeric := (payload ->> 'target_sell_price')::numeric;
  v_sold_at     timestamptz;
  v_product_id  uuid;
  v_opp_id      uuid;
  v_sku         text;
  v_ids         uuid[] := ARRAY[]::uuid[];
  v_skus        text[] := ARRAY[]::text[];
BEGIN
  IF v_asin IS NULL OR v_asin !~ '^[A-Z0-9]{10}$' THEN
    RAISE EXCEPTION 'create_manual_deal: invalid asin' USING ERRCODE = '22023';
  END IF;
  IF v_title IS NULL OR v_title = '' THEN
    RAISE EXCEPTION 'create_manual_deal: title is required' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('pending', 'rejected', 'bought', 'in_inventory', 'listed', 'sold', 'cancelled', 'written_off') THEN
    RAISE EXCEPTION 'create_manual_deal: invalid status' USING ERRCODE = '22023';
  END IF;
  IF (payload ->> 'buy_price') IS NULL OR (payload ->> 'buy_price')::numeric <= 0
     OR v_target IS NULL OR v_target <= 0 THEN
    RAISE EXCEPTION 'create_manual_deal: buy_price and target_sell_price must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF v_qty < 1 OR v_qty > 50 THEN
    RAISE EXCEPTION 'create_manual_deal: quantity must be between 1 and 50' USING ERRCODE = '22023';
  END IF;
  IF v_qty > 1 AND v_status = 'sold' THEN
    RAISE EXCEPTION 'create_manual_deal: several units cannot be created directly as sold' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(payload ->> 'listing_title'), '') = '' OR COALESCE(btrim(payload ->> 'listing_description'), '') = '' THEN
    RAISE EXCEPTION 'create_manual_deal: listing_title and listing_description are required' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('vindera.actor', COALESCE(payload ->> 'actor', ''), true);

  IF jsonb_typeof(payload -> 'gallery_image_urls') = 'array' THEN
    SELECT COALESCE(array_agg(u), '{}') INTO v_gallery
      FROM jsonb_array_elements_text(payload -> 'gallery_image_urls') AS u
     WHERE btrim(u) <> '';
  ELSE
    v_gallery := '{}';
  END IF;

  INSERT INTO public.products (asin, amazon_locale, title, category, image_url, gallery_image_urls)
  VALUES (
    v_asin, v_locale, v_title,
    COALESCE(NULLIF(payload ->> 'category', ''), 'Other'),
    NULLIF(payload ->> 'image_url', ''),
    v_gallery
  )
  ON CONFLICT (asin, amazon_locale) DO UPDATE
    SET title              = EXCLUDED.title,
        category           = EXCLUDED.category,
        image_url          = COALESCE(EXCLUDED.image_url, public.products.image_url),
        gallery_image_urls = EXCLUDED.gallery_image_urls
  RETURNING id INTO v_product_id;

  -- Two honest reference points when both Amazon prices are supplied.
  IF (payload ->> 'amazon_price_today') IS NOT NULL AND (payload ->> 'amazon_price_90d_avg') IS NOT NULL THEN
    INSERT INTO public.price_history (product_id, price_amazon, recorded_at, is_deal)
    VALUES
      (v_product_id, (payload ->> 'amazon_price_90d_avg')::numeric, now() - interval '90 days', false),
      (v_product_id, (payload ->> 'amazon_price_today')::numeric,   now(),
       (payload ->> 'amazon_price_today')::numeric < (payload ->> 'amazon_price_90d_avg')::numeric)
    ON CONFLICT (product_id, recorded_at) DO NOTHING;
  END IF;

  v_sold_at := CASE WHEN v_status = 'sold'
                    THEN COALESCE((payload ->> 'sold_at')::timestamptz, now())
                    ELSE NULL END;

  FOR v_i IN 1..v_qty LOOP
    v_sku := CASE
      WHEN v_base_sku IS NULL THEN public.generate_sku()
      WHEN v_qty = 1          THEN v_base_sku
      ELSE left(v_base_sku, 44) || '-' || v_i::text
    END;

    INSERT INTO public.opportunities (
      product_id, buy_price, target_sell_price, emergency_sell_price, willhaben_realistic_price,
      willhaben_url, profit_margin, net_profit_estimate, net_margin_estimate, ai_decision, status,
      buybox_seller, buybox_is_fba, deal_score, holding_period_months, seasonality_analysis, sku,
      warehouse_location, product_condition, is_quarantine, score_breakdown, purchase_thesis,
      purchase_price_actual, purchased_at, order_ref, inbound_shipping_cost, packaging_cost,
      received_at, listed_at, return_by,
      sold_at, actual_sell_price, actual_profit, shipping_and_prep_cost, platform_fees,
      customer_inquiries_count, customer_messages_summary, sold_during_event, time_to_sell_days
    ) VALUES (
      v_product_id,
      (payload ->> 'buy_price')::numeric,
      v_target,
      (payload ->> 'emergency_sell_price')::numeric,
      COALESCE((payload ->> 'willhaben_realistic_price')::numeric, v_target),
      NULLIF(payload ->> 'willhaben_url', ''),
      (payload ->> 'profit_margin')::numeric,
      (payload ->> 'net_profit_estimate')::numeric,
      (payload ->> 'net_margin_estimate')::numeric,
      COALESCE(payload ->> 'ai_decision', 'Manually entered deal. No automated analysis was performed.'),
      v_status,
      COALESCE(NULLIF(payload ->> 'buybox_seller', ''), 'Manual'),
      COALESCE((payload ->> 'buybox_is_fba')::boolean, false),
      COALESCE((payload ->> 'deal_score')::integer, 85),
      COALESCE((payload ->> 'holding_period_months')::integer, 2),
      payload ->> 'seasonality_analysis',
      v_sku,
      COALESCE(NULLIF(payload ->> 'warehouse_location', ''), 'A01'),
      COALESCE(NULLIF(payload ->> 'product_condition', ''), 'NEW'),
      COALESCE((payload ->> 'is_quarantine')::boolean, false),
      v_breakdown,
      payload ->> 'purchase_thesis',
      (payload ->> 'purchase_price_actual')::numeric,
      (payload ->> 'purchased_at')::timestamptz,
      NULLIF(payload ->> 'order_ref', ''),
      (payload ->> 'inbound_shipping_cost')::numeric,
      (payload ->> 'packaging_cost')::numeric,
      (payload ->> 'received_at')::timestamptz,
      (payload ->> 'listed_at')::timestamptz,
      (payload ->> 'return_by')::date,
      v_sold_at,
      CASE WHEN v_status = 'sold' THEN (payload ->> 'actual_sell_price')::numeric END,
      CASE WHEN v_status = 'sold' THEN (payload ->> 'actual_profit')::numeric END,
      CASE WHEN v_status = 'sold' THEN (payload ->> 'shipping_and_prep_cost')::numeric END,
      CASE WHEN v_status = 'sold' THEN (payload ->> 'platform_fees')::numeric END,
      CASE WHEN v_status = 'sold' THEN COALESCE((payload ->> 'customer_inquiries_count')::integer, 0) ELSE 0 END,
      CASE WHEN v_status = 'sold' THEN payload ->> 'customer_messages_summary' END,
      CASE WHEN v_status = 'sold' THEN payload ->> 'sold_during_event' END,
      CASE WHEN v_status = 'sold' THEN (payload ->> 'time_to_sell_days')::integer END
    )
    RETURNING id INTO v_opp_id;

    INSERT INTO public.generated_listings (
      opportunity_id, target_platform, language, generated_title, generated_description
    ) VALUES (
      v_opp_id, 'Willhaben', 'de',
      btrim(payload ->> 'listing_title'), btrim(payload ->> 'listing_description')
    );

    IF v_status = 'sold' THEN
      INSERT INTO public.sale_events (
        opportunity_id, event_type, amount, shipping_cost, platform_fees, occurred_at, note
      ) VALUES (
        v_opp_id, 'sale',
        COALESCE((payload ->> 'actual_sell_price')::numeric, v_target),
        COALESCE((payload ->> 'shipping_and_prep_cost')::numeric, 0),
        COALESCE((payload ->> 'platform_fees')::numeric, 0),
        v_sold_at,
        CASE WHEN (payload ->> 'actual_sell_price') IS NULL
             THEN 'Entered via manual entry; actual sell price was empty, amount is the target price.'
             ELSE 'Entered via manual entry.' END
      );
    END IF;

    v_ids  := v_ids  || v_opp_id;
    v_skus := v_skus || v_sku;
  END LOOP;

  RETURN jsonb_build_object(
    'opportunity_ids', to_jsonb(v_ids),
    'skus',            to_jsonb(v_skus),
    'product_id',      v_product_id
  );
END;
$$;

-- =============================================================================
-- update_manual_deal
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."update_manual_deal"(p_id uuid, payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing    public.opportunities%ROWTYPE;
  v_asin        text := upper(btrim(payload ->> 'asin'));
  v_locale      text := COALESCE(NULLIF(payload ->> 'amazon_locale', ''), 'DE');
  v_title       text := btrim(payload ->> 'title');
  v_status      text := COALESCE(payload ->> 'status', 'pending');
  v_target      numeric := (payload ->> 'target_sell_price')::numeric;
  v_base_sku    text := NULLIF(btrim(payload ->> 'sku'), '');
  v_breakdown   jsonb := NULLIF(payload -> 'score_breakdown', 'null'::jsonb);
  v_gallery     text[];
  v_sku         text;
  v_sold_at     timestamptz;
  v_sale        public.sale_events%ROWTYPE;
  v_listing_id  uuid;
BEGIN
  IF v_asin IS NULL OR v_asin !~ '^[A-Z0-9]{10}$' THEN
    RAISE EXCEPTION 'update_manual_deal: invalid asin' USING ERRCODE = '22023';
  END IF;
  IF v_title IS NULL OR v_title = '' THEN
    RAISE EXCEPTION 'update_manual_deal: title is required' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('pending', 'rejected', 'bought', 'in_inventory', 'listed', 'sold', 'cancelled', 'written_off') THEN
    RAISE EXCEPTION 'update_manual_deal: invalid status' USING ERRCODE = '22023';
  END IF;
  IF (payload ->> 'buy_price') IS NULL OR (payload ->> 'buy_price')::numeric <= 0
     OR v_target IS NULL OR v_target <= 0 THEN
    RAISE EXCEPTION 'update_manual_deal: buy_price and target_sell_price must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(payload ->> 'listing_title'), '') = '' OR COALESCE(btrim(payload ->> 'listing_description'), '') = '' THEN
    RAISE EXCEPTION 'update_manual_deal: listing_title and listing_description are required' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('vindera.actor', COALESCE(payload ->> 'actor', ''), true);

  SELECT * INTO v_existing
    FROM public.opportunities
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opportunity % not found', p_id USING ERRCODE = 'P0002';
  END IF;

  -- Ledger guards for sold deals.
  IF v_existing.status = 'sold' AND v_status <> 'sold' THEN
    RAISE EXCEPTION 'A sold deal cannot be moved back by editing it. Record a return instead.'
      USING ERRCODE = '55000';
  END IF;

  IF v_existing.status = 'sold' THEN
    SELECT * INTO v_sale FROM public.sale_events
     WHERE opportunity_id = p_id AND event_type = 'sale'
     ORDER BY occurred_at DESC, created_at DESC LIMIT 1;
    IF FOUND AND (
         ((payload ->> 'actual_sell_price') IS NOT NULL
            AND round((payload ->> 'actual_sell_price')::numeric, 2) <> v_sale.amount)
      OR ((payload ->> 'shipping_and_prep_cost') IS NOT NULL
            AND round((payload ->> 'shipping_and_prep_cost')::numeric, 2) <> v_sale.shipping_cost)
      OR ((payload ->> 'platform_fees') IS NOT NULL
            AND round((payload ->> 'platform_fees')::numeric, 2) <> v_sale.platform_fees)
    ) THEN
      RAISE EXCEPTION 'The recorded sale amounts cannot be edited (ledger). Record a return and then a new sale instead.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  v_sku := COALESCE(v_base_sku, v_existing.sku, public.generate_sku());

  IF jsonb_typeof(payload -> 'gallery_image_urls') = 'array' THEN
    SELECT COALESCE(array_agg(u), '{}') INTO v_gallery
      FROM jsonb_array_elements_text(payload -> 'gallery_image_urls') AS u
     WHERE btrim(u) <> '';
  ELSE
    v_gallery := '{}';
  END IF;

  UPDATE public.products SET
    asin               = v_asin,
    amazon_locale      = v_locale,
    title              = v_title,
    category           = COALESCE(NULLIF(payload ->> 'category', ''), 'Other'),
    image_url          = NULLIF(payload ->> 'image_url', ''),
    gallery_image_urls = v_gallery
  WHERE id = v_existing.product_id;

  -- Both Amazon reference prices supplied: replace the product's history with the two points.
  IF (payload ->> 'amazon_price_today') IS NOT NULL AND (payload ->> 'amazon_price_90d_avg') IS NOT NULL THEN
    DELETE FROM public.price_history WHERE product_id = v_existing.product_id;
    INSERT INTO public.price_history (product_id, price_amazon, recorded_at, is_deal)
    VALUES
      (v_existing.product_id, (payload ->> 'amazon_price_90d_avg')::numeric, now() - interval '90 days', false),
      (v_existing.product_id, (payload ->> 'amazon_price_today')::numeric,   now(),
       (payload ->> 'amazon_price_today')::numeric < (payload ->> 'amazon_price_90d_avg')::numeric);
  END IF;

  v_sold_at := CASE WHEN v_status = 'sold'
                    THEN COALESCE(v_existing.sold_at, (payload ->> 'sold_at')::timestamptz, now())
                    ELSE NULL END;

  UPDATE public.opportunities SET
    buy_price                 = (payload ->> 'buy_price')::numeric,
    target_sell_price         = v_target,
    emergency_sell_price      = (payload ->> 'emergency_sell_price')::numeric,
    willhaben_realistic_price = COALESCE((payload ->> 'willhaben_realistic_price')::numeric, v_target),
    willhaben_url             = NULLIF(payload ->> 'willhaben_url', ''),
    profit_margin             = CASE WHEN payload ? 'profit_margin' THEN (payload ->> 'profit_margin')::numeric ELSE profit_margin END,
    net_profit_estimate       = CASE WHEN payload ? 'net_profit_estimate' THEN (payload ->> 'net_profit_estimate')::numeric ELSE net_profit_estimate END,
    net_margin_estimate       = CASE WHEN payload ? 'net_margin_estimate' THEN (payload ->> 'net_margin_estimate')::numeric ELSE net_margin_estimate END,
    ai_decision               = COALESCE(payload ->> 'ai_decision', 'Manually entered deal. No automated analysis was performed.'),
    status                    = v_status,
    buybox_seller             = COALESCE(NULLIF(payload ->> 'buybox_seller', ''), 'Manual'),
    buybox_is_fba             = COALESCE((payload ->> 'buybox_is_fba')::boolean, false),
    deal_score                = COALESCE((payload ->> 'deal_score')::integer, 85),
    holding_period_months     = COALESCE((payload ->> 'holding_period_months')::integer, 2),
    seasonality_analysis      = payload ->> 'seasonality_analysis',
    sku                       = v_sku,
    warehouse_location        = COALESCE(NULLIF(payload ->> 'warehouse_location', ''), 'A01'),
    product_condition         = COALESCE(NULLIF(payload ->> 'product_condition', ''), 'NEW'),
    is_quarantine             = COALESCE((payload ->> 'is_quarantine')::boolean, false),
    score_breakdown           = v_breakdown,
    purchase_thesis           = payload ->> 'purchase_thesis',
    -- Lifecycle columns: only touched when the key is present in the payload.
    purchase_price_actual     = CASE WHEN payload ? 'purchase_price_actual' THEN (payload ->> 'purchase_price_actual')::numeric ELSE purchase_price_actual END,
    purchased_at              = CASE WHEN payload ? 'purchased_at' THEN (payload ->> 'purchased_at')::timestamptz ELSE purchased_at END,
    order_ref                 = CASE WHEN payload ? 'order_ref' THEN NULLIF(payload ->> 'order_ref', '') ELSE order_ref END,
    inbound_shipping_cost     = CASE WHEN payload ? 'inbound_shipping_cost' THEN (payload ->> 'inbound_shipping_cost')::numeric ELSE inbound_shipping_cost END,
    packaging_cost            = CASE WHEN payload ? 'packaging_cost' THEN (payload ->> 'packaging_cost')::numeric ELSE packaging_cost END,
    received_at               = CASE WHEN payload ? 'received_at' THEN (payload ->> 'received_at')::timestamptz ELSE received_at END,
    listed_at                 = CASE WHEN payload ? 'listed_at' THEN (payload ->> 'listed_at')::timestamptz ELSE listed_at END,
    return_by                 = CASE WHEN payload ? 'return_by' THEN (payload ->> 'return_by')::date ELSE return_by END,
    -- Sale outcome: kept as is unless the deal is (still) sold and the key is present.
    sold_at                   = v_sold_at,
    actual_sell_price         = CASE WHEN v_status = 'sold' AND payload ? 'actual_sell_price' THEN (payload ->> 'actual_sell_price')::numeric
                                     WHEN v_status = 'sold' THEN actual_sell_price ELSE NULL END,
    actual_profit             = CASE WHEN v_status = 'sold' AND payload ? 'actual_profit' THEN (payload ->> 'actual_profit')::numeric
                                     WHEN v_status = 'sold' THEN actual_profit ELSE NULL END,
    shipping_and_prep_cost    = CASE WHEN v_status = 'sold' AND payload ? 'shipping_and_prep_cost' THEN (payload ->> 'shipping_and_prep_cost')::numeric
                                     WHEN v_status = 'sold' THEN shipping_and_prep_cost ELSE NULL END,
    platform_fees             = CASE WHEN v_status = 'sold' AND payload ? 'platform_fees' THEN (payload ->> 'platform_fees')::numeric
                                     WHEN v_status = 'sold' THEN platform_fees ELSE NULL END,
    customer_inquiries_count  = CASE WHEN v_status = 'sold' AND payload ? 'customer_inquiries_count' THEN COALESCE((payload ->> 'customer_inquiries_count')::integer, 0)
                                     WHEN v_status = 'sold' THEN customer_inquiries_count ELSE 0 END,
    customer_messages_summary = CASE WHEN v_status = 'sold' AND payload ? 'customer_messages_summary' THEN payload ->> 'customer_messages_summary'
                                     WHEN v_status = 'sold' THEN customer_messages_summary ELSE NULL END,
    sold_during_event         = CASE WHEN v_status = 'sold' AND payload ? 'sold_during_event' THEN payload ->> 'sold_during_event'
                                     WHEN v_status = 'sold' THEN sold_during_event ELSE NULL END,
    time_to_sell_days         = CASE WHEN v_status = 'sold' AND payload ? 'time_to_sell_days' THEN (payload ->> 'time_to_sell_days')::integer
                                     WHEN v_status = 'sold' THEN time_to_sell_days ELSE NULL END
  WHERE id = p_id;

  -- A deal that becomes sold through an edit must appear in the ledger.
  IF v_status = 'sold' AND NOT EXISTS (
    SELECT 1 FROM public.sale_events WHERE opportunity_id = p_id AND event_type = 'sale'
  ) THEN
    INSERT INTO public.sale_events (
      opportunity_id, event_type, amount, shipping_cost, platform_fees, occurred_at, note
    ) VALUES (
      p_id, 'sale',
      COALESCE((payload ->> 'actual_sell_price')::numeric, v_target),
      COALESCE((payload ->> 'shipping_and_prep_cost')::numeric, 0),
      COALESCE((payload ->> 'platform_fees')::numeric, 0),
      v_sold_at,
      CASE WHEN (payload ->> 'actual_sell_price') IS NULL
           THEN 'Entered via manual entry; actual sell price was empty, amount is the target price.'
           ELSE 'Entered via manual entry.' END
    );
  END IF;

  SELECT id INTO v_listing_id
    FROM public.generated_listings
   WHERE opportunity_id = p_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_listing_id IS NOT NULL THEN
    UPDATE public.generated_listings SET
      generated_title       = btrim(payload ->> 'listing_title'),
      generated_description = btrim(payload ->> 'listing_description')
    WHERE id = v_listing_id;
  ELSE
    INSERT INTO public.generated_listings (
      opportunity_id, target_platform, language, generated_title, generated_description
    ) VALUES (
      p_id, 'Willhaben', 'de',
      btrim(payload ->> 'listing_title'), btrim(payload ->> 'listing_description')
    );
  END IF;

  RETURN jsonb_build_object(
    'opportunity_id', p_id,
    'product_id',     v_existing.product_id,
    'sku',            v_sku
  );
END;
$$;

-- =============================================================================
-- record_sale
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."record_sale"(p_id uuid, payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp           public.opportunities%ROWTYPE;
  v_amount        numeric := (payload ->> 'amount')::numeric;
  v_shipping      numeric := COALESCE((payload ->> 'shipping_cost')::numeric, 0);
  v_fees          numeric := COALESCE((payload ->> 'platform_fees')::numeric, 0);
  v_occurred      timestamptz := COALESCE((payload ->> 'occurred_at')::timestamptz, now());
  v_reference     timestamptz;
  v_days          integer;
  v_event_id      uuid;
BEGIN
  IF v_amount IS NULL OR v_amount < 0 THEN
    RAISE EXCEPTION 'record_sale: amount is required and must not be negative' USING ERRCODE = '22023';
  END IF;
  IF v_shipping < 0 OR v_fees < 0 THEN
    RAISE EXCEPTION 'record_sale: shipping_cost and platform_fees must not be negative' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('vindera.actor', COALESCE(payload ->> 'actor', ''), true);

  SELECT * INTO v_opp
    FROM public.opportunities
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opportunity % not found', p_id USING ERRCODE = 'P0002';
  END IF;

  IF v_opp.status NOT IN ('bought', 'in_inventory', 'listed') THEN
    RAISE EXCEPTION 'A deal in status "%" cannot be sold.', v_opp.status USING ERRCODE = '55000';
  END IF;

  v_reference := COALESCE(v_opp.listed_at, v_opp.purchased_at, v_opp.created_at, v_occurred);
  v_days := GREATEST(floor(extract(epoch FROM (v_occurred - v_reference)) / 86400)::integer, 0);

  INSERT INTO public.sale_events (
    opportunity_id, event_type, amount, shipping_cost, platform_fees, occurred_at, note
  ) VALUES (
    p_id, 'sale', v_amount, v_shipping, v_fees, v_occurred, NULLIF(payload ->> 'note', '')
  )
  RETURNING id INTO v_event_id;

  UPDATE public.opportunities SET
    status                    = 'sold',
    sold_at                   = v_occurred,
    time_to_sell_days         = v_days,
    actual_sell_price         = v_amount,
    actual_profit             = (payload ->> 'actual_profit')::numeric,
    shipping_and_prep_cost    = v_shipping,
    platform_fees             = v_fees,
    customer_inquiries_count  = COALESCE((payload ->> 'customer_inquiries_count')::integer, 0),
    customer_messages_summary = NULLIF(payload ->> 'customer_messages_summary', ''),
    sold_during_event         = NULLIF(payload ->> 'sold_during_event', '')
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'opportunity_id',    p_id,
    'sale_event_id',     v_event_id,
    'sold_at',           v_occurred,
    'time_to_sell_days', v_days
  );
END;
$$;

-- =============================================================================
-- record_return
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."record_return"(p_id uuid, payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp           public.opportunities%ROWTYPE;
  v_retained      numeric;
  v_refund        numeric;
  v_return_ship   numeric := COALESCE((payload ->> 'return_shipping_cost')::numeric, 0);
  v_occurred      timestamptz := COALESCE((payload ->> 'occurred_at')::timestamptz, now());
  v_event_id      uuid;
BEGIN
  IF v_return_ship < 0 THEN
    RAISE EXCEPTION 'record_return: return_shipping_cost must not be negative' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('vindera.actor', COALESCE(payload ->> 'actor', ''), true);

  SELECT * INTO v_opp
    FROM public.opportunities
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opportunity % not found', p_id USING ERRCODE = 'P0002';
  END IF;

  IF v_opp.status <> 'sold' THEN
    RAISE EXCEPTION 'Only a sold deal can be returned (current status: %).', v_opp.status USING ERRCODE = '55000';
  END IF;

  -- What the customer has paid and not yet been refunded (sales positive, refunds negative).
  SELECT COALESCE(SUM(amount), 0) INTO v_retained
    FROM public.sale_events
   WHERE opportunity_id = p_id;

  v_refund := COALESCE((payload ->> 'refund_amount')::numeric, v_retained);
  IF v_refund < 0 OR v_refund > v_retained THEN
    RAISE EXCEPTION 'record_return: refund_amount must be between 0 and % (still retained)', v_retained
      USING ERRCODE = '22023';
  END IF;

  -- The refund event is written first; only then does the unit leave the sold state.
  INSERT INTO public.sale_events (
    opportunity_id, event_type, amount, shipping_cost, platform_fees, occurred_at, note
  ) VALUES (
    p_id, 'refund', -v_refund, v_return_ship, 0, v_occurred, NULLIF(payload ->> 'note', '')
  )
  RETURNING id INTO v_event_id;

  UPDATE public.opportunities SET
    status                    = 'in_inventory',
    is_quarantine             = true,
    product_condition         = 'REVIEW NEEDED',
    sold_at                   = NULL,
    listed_at                 = NULL,
    time_to_sell_days         = NULL,
    actual_sell_price         = NULL,
    actual_profit             = NULL,
    shipping_and_prep_cost    = NULL,
    platform_fees             = NULL,
    customer_inquiries_count  = 0,
    customer_messages_summary = NULL,
    sold_during_event         = NULL
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'opportunity_id',  p_id,
    'refund_event_id', v_event_id,
    'refund_amount',   v_refund
  );
END;
$$;

-- =============================================================================
-- Access: service role only
-- =============================================================================

REVOKE ALL ON FUNCTION "public"."generate_sku"()                        FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."persist_scan_result"(jsonb)            FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."create_manual_deal"(jsonb)             FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."update_manual_deal"(uuid, jsonb)       FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."record_sale"(uuid, jsonb)              FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."record_return"(uuid, jsonb)            FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."generate_sku"()                     TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."persist_scan_result"(jsonb)         TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."create_manual_deal"(jsonb)          TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_manual_deal"(uuid, jsonb)    TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_sale"(uuid, jsonb)           TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_return"(uuid, jsonb)         TO "service_role";
