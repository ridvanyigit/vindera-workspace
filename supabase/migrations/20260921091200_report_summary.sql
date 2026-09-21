-- =============================================================================
-- Server-side report for one calendar year: report_summary(p_year)
-- =============================================================================
-- Why (launch-hardening audit):
--   C3  Reports used target_sell_price as revenue and (target - buy) as profit,
--       ignoring the real sale, shipping and fees.
--   C4  The Kleinunternehmer EUR 55,000 bar summed ALL time, not the year.
--   C5  Reports fetched every opportunity in the browser; PostgREST silently
--       stops at 1000 rows, so totals could be wrong without any error.
--
-- Everything is aggregated here, from the ledger (`sale_events`), the units
-- (`opportunities`) and `business_expenses`. The years run in Vienna time
-- (Europe/Vienna), not UTC, so a sale at 23:30 on 31 December belongs to the
-- year the owner experienced it.
--
-- MANAGEMENT VIEW (accrual style, by when the sale happened)
--   revenue        sum of sale amounts, refunds (negative) already netted
--   cogs           effective cost (planned or recorded purchase price + inbound
--                  shipping + packaging) of the units sold; a refund reverses it,
--                  because the unit is back in stock
--   shipping       outbound / return shipping recorded on the events
--   platform_fees  fees recorded on the events
--   gross_profit   revenue - cogs - shipping - platform_fees
--   profit_before_tax = gross_profit - business expenses of the year
--   Costs that were never recorded count as zero (the same rule the sale
--   endpoint uses for actual_profit), so a per-deal profit and this report agree.
--
-- CASH VIEW (Einnahmen-Ausgaben logic, by when the money moved)
--   income     same as revenue (by the date of the sale / refund)
--   purchases  effective cost of every unit that was bought, by purchase date;
--              a unit without a recorded purchase date falls back to its
--              receipt date, then the scan date, and is counted in
--              purchases_estimated_date so the page can warn about it
--   shipping, platform_fees, expenses  by the date of the event / expense
--   How purchases are deducted for tax is for the Steuerberater to confirm.
--
-- VAT: revenue of the calendar year against business_settings.vat_threshold_eur.
--
-- Only the service role may execute it (the backend checks the admin first).
-- Idempotent: safe to run more than once (CREATE OR REPLACE).
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."report_summary"(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz         constant text := 'Europe/Vienna';
  v_from       timestamptz;
  v_to         timestamptz;
  v_threshold  numeric := 55000;
  v_warn       numeric := 80;
  v_result     jsonb;
BEGIN
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'report_summary: year must be between 2000 and 2100' USING ERRCODE = '22023';
  END IF;

  v_from := make_timestamptz(p_year, 1, 1, 0, 0, 0, v_tz);
  v_to   := make_timestamptz(p_year + 1, 1, 1, 0, 0, 0, v_tz);

  SELECT vat_threshold_eur, vat_warn_pct INTO v_threshold, v_warn
    FROM public.business_settings WHERE id = 1;
  v_threshold := COALESCE(v_threshold, 55000);
  v_warn      := COALESCE(v_warn, 80);

  WITH ev AS (
    SELECT e.event_type, e.amount, e.shipping_cost, e.platform_fees,
           (e.occurred_at AT TIME ZONE v_tz) AS local_at,
           CASE e.event_type
             WHEN 'sale' THEN public.effective_total_cost(o)
             ELSE -public.effective_total_cost(o)
           END AS cogs,
           COALESCE(NULLIF(btrim(p.category), ''), 'Other') AS category
      FROM public.sale_events e
      JOIN public.opportunities o ON o.id = e.opportunity_id
      JOIN public.products p ON p.id = o.product_id
     WHERE e.occurred_at >= v_from AND e.occurred_at < v_to
  ),
  totals AS (
    SELECT COALESCE(sum(amount), 0)         AS revenue,
           COALESCE(sum(cogs), 0)           AS cogs,
           COALESCE(sum(shipping_cost), 0)  AS shipping,
           COALESCE(sum(platform_fees), 0)  AS fees,
           count(*) FILTER (WHERE event_type = 'sale') - count(*) FILTER (WHERE event_type = 'refund') AS units
      FROM ev
  ),
  expenses AS (
    SELECT COALESCE(sum(amount), 0) AS total
      FROM public.business_expenses
     WHERE incurred_at >= make_date(p_year, 1, 1) AND incurred_at < make_date(p_year + 1, 1, 1)
  ),
  monthly AS (
    SELECT m AS month,
           COALESCE(sum(ev.amount), 0)                                                   AS revenue,
           COALESCE(sum(ev.cogs), 0)                                                     AS cogs,
           COALESCE(sum(ev.shipping_cost), 0)                                            AS shipping,
           COALESCE(sum(ev.platform_fees), 0)                                            AS fees,
           COALESCE(sum(ev.amount - ev.cogs - ev.shipping_cost - ev.platform_fees), 0)   AS gross_profit
      FROM generate_series(1, 12) AS m
      LEFT JOIN ev ON extract(month FROM ev.local_at) = m
     GROUP BY m
  ),
  by_category AS (
    SELECT category,
           sum(amount)                                                                                  AS revenue,
           sum(cogs)                                                                                    AS cogs,
           sum(amount - cogs - shipping_cost - platform_fees)                                           AS gross_profit,
           count(*) FILTER (WHERE event_type = 'sale') - count(*) FILTER (WHERE event_type = 'refund')  AS units
      FROM ev
     GROUP BY category
  ),
  purchases AS (
    SELECT public.effective_total_cost(o) AS cost,
           o.purchased_at IS NULL         AS estimated_date
      FROM public.opportunities o
     WHERE o.deleted_at IS NULL
       AND o.status IN ('bought', 'in_inventory', 'listed', 'sold', 'written_off')
       AND COALESCE(o.purchased_at, o.received_at, o.created_at) >= v_from
       AND COALESCE(o.purchased_at, o.received_at, o.created_at) <  v_to
  ),
  cash_purchases AS (
    SELECT COALESCE(sum(cost), 0)                     AS total,
           count(*) FILTER (WHERE estimated_date)     AS estimated_date_count
      FROM purchases
  ),
  years AS (
    SELECT extract(year FROM occurred_at AT TIME ZONE v_tz)::integer AS y FROM public.sale_events
    UNION SELECT extract(year FROM incurred_at)::integer FROM public.business_expenses
    UNION SELECT extract(year FROM COALESCE(purchased_at, received_at, created_at) AT TIME ZONE v_tz)::integer
            FROM public.opportunities WHERE deleted_at IS NULL
    UNION SELECT extract(year FROM now() AT TIME ZONE v_tz)::integer
    UNION SELECT p_year
  )
  SELECT jsonb_build_object(
    'year', p_year,
    'management', jsonb_build_object(
      'revenue',           t.revenue,
      'cogs',              t.cogs,
      'shipping',          t.shipping,
      'platform_fees',     t.fees,
      'gross_profit',      t.revenue - t.cogs - t.shipping - t.fees,
      'expenses_total',    x.total,
      'profit_before_tax', t.revenue - t.cogs - t.shipping - t.fees - x.total,
      'units_sold',        t.units,
      'roi_pct',           CASE WHEN t.cogs > 0
                                THEN round((t.revenue - t.cogs - t.shipping - t.fees) / t.cogs * 100, 2) END,
      'monthly', (
        SELECT jsonb_agg(jsonb_build_object(
                 'month', month, 'revenue', revenue, 'cogs', cogs, 'shipping', shipping,
                 'platform_fees', fees, 'gross_profit', gross_profit) ORDER BY month)
          FROM monthly),
      'by_category', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'category', category, 'revenue', revenue, 'cogs', cogs, 'gross_profit', gross_profit, 'units', units)
               ORDER BY revenue DESC)
          FROM by_category), '[]'::jsonb)
    ),
    'cash', jsonb_build_object(
      'income',                    t.revenue,
      'purchases',                 cp.total,
      'purchases_estimated_date',  cp.estimated_date_count,
      'shipping',                  t.shipping,
      'platform_fees',             t.fees,
      'expenses',                  x.total,
      'result',                    t.revenue - cp.total - t.shipping - t.fees - x.total
    ),
    'vat', jsonb_build_object(
      'threshold', v_threshold,
      'revenue',   t.revenue,
      'pct',       round(t.revenue / v_threshold * 100, 2),
      'warn_pct',  v_warn
    ),
    'available_years', (SELECT jsonb_agg(y ORDER BY y DESC) FROM years)
  ) INTO v_result
  FROM totals t, expenses x, cash_purchases cp;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION "public"."report_summary"(integer) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."report_summary"(integer) TO "service_role";
