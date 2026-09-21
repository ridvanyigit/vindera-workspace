# VINDERA — LAUNCH HARDENING PLAN

> This file is a work order for Claude Code. It is NOT loaded automatically; the owner points Claude Code at it.
> Read the WHOLE file before doing anything. Then work phase by phase.

---

## 0. Who you are working for, and how to communicate

- The owner is a solo Austrian **Kleinunternehmer** running a small arbitrage business: buy new goods on Amazon.de, resell on Willhaben (Austria). Vindera is their back office (`/admin/*`) plus a small public storefront (`/`) that redirects to the live Willhaben ad.
- **Talk to the owner in Turkish.** Write code, comments, commit messages, migrations and `docs/*.md` (except the files named below as Turkish) in **English**.
- The owner is not a professional developer. Never ask them an open technical question you can decide yourself with a sensible default. Ask only when a decision is marked `STOP-ASK` in this plan or when something is truly irreversible or outward-facing.
- The goal: remove every weakness listed below and make the app safe to put live **as soon as possible**, without over-engineering. Prefer the simplest robust solution. Do not add features that are not in this plan (except where a task says "if trivial").

## 1. Hard rules (apply to every phase)

1. **Never** read out, print, log or commit secrets. Do not open or modify `/.env` or `frontend/.env.local`. Only edit `.env.example` (placeholders only).
2. **Never run** `supabase db push`, `git push`, any deploy command, or anything that touches the remote/hosted Supabase project, without explicit owner confirmation in chat. Local verification only: `supabase db reset` if Docker + Supabase CLI are available; otherwise validate SQL by careful review and say so.
3. **Never edit an already-applied migration** in `supabase/migrations/`. Create new files named `YYYYMMDDHHMMSS_description.sql`, timestamps later than `20260920090100`. Use `20260921...` and later. Every migration must be **idempotent-safe where feasible** (`IF NOT EXISTS`, `DO $$` guards) and start with a header comment explaining why, in the style of the existing migrations.
4. **Write-path rule stays**: all frontend mutations go through the FastAPI backend (service role). The only existing exception is invoice upload (see Phase 5). Do not add new direct writes from the browser.
5. **Public data contract stays**: the storefront reads only the `storefront_listings` view. Never expose buy price, margin, thesis, quarantine or internal fields.
6. **Category lists** `backend/src/core/categories.py` and `frontend/src/lib/constants.ts` must stay in sync if you touch either.
7. **Every admin page (current and new) needs the dark/light toggle and the `vindera-admin` root class** (`useDarkMode`, see existing admin pages). Do not add an admin page without it.
8. Frontend conventions: Tailwind v4 (no config file), use the semantic typography classes from `globals.css` (`.type-page-title`, `.type-section-title`, `.type-label`, `.type-metric`, `.type-body`), `ProductCard` never sets its own outer width.
9. Match surrounding code style and comment density. Do not reformat unrelated code. No emoji in new code/logs.
10. Work on a git branch `launch-hardening` (create it from `main` in Phase 0). **Commit at the end of each phase** (one commit per phase, clear message). Never push. Never force anything.
11. Keep the app runnable at the end of every phase (`uv run uvicorn src.main:app` starts, `npm run build` passes). If a phase changes the API contract, change backend and frontend in the same phase.
12. Track progress in `docs/LAUNCH-PROGRESS.md` (create in Phase 0): one checkbox per task ID, updated as you go, plus a "Decisions & assumptions" section. A future session must be able to resume from this file alone.
13. If you cannot do something yourself (needs dashboards, accounts, money, legal/tax advice, physical actions), do **not** skip it silently: add it to `docs/MANUEL-ADIMLAR.md` (Section 12) and mention it in your end-of-phase summary.
14. If reality differs from this plan (a file moved, a function already fixed), trust the code, note the difference in `LAUNCH-PROGRESS.md`, and adapt.

## 2. How to run a phase

For each phase: (a) re-read its tasks, (b) inspect the relevant code first, (c) implement, (d) run the verification commands, (e) update `LAUNCH-PROGRESS.md`, (f) commit, (g) print a short Turkish summary: what changed, what was verified, what the owner must do manually, what is next.
If you are running low on context, finish the current task, update `LAUNCH-PROGRESS.md`, and tell the owner to continue in a fresh session.

Verification commands (use whatever exists at that point):
```bash
cd backend && uv run python -c "import src.main"        # import check
cd backend && uv run pytest -q                           # after Phase 7 (earlier: only tests you added)
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```
(Frontend build needs `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`; pass dummy values inline on the command line, do not read `.env.local`.)

---

## 3. Project facts you must know (verified by an earlier audit)

- Backend: FastAPI, `backend/src/{main.py, api/endpoints/{deals,chat,expenses}.py, agents/*, services/{keepa,notification}_service.py, core/{config,database,categories}.py}`. Python 3.14, `uv`.
- Frontend: Next.js (App Router), all pages `'use client'`. Admin pages: `admin/{page,products/page,manual-entry/page,reports/page,login/page}.tsx`.
- DB: Supabase Postgres, migrations in `supabase/migrations/`. Tables: `products`, `opportunities` (one row = one physical unit), `price_history`, `generated_listings`, `events_calendar`, `business_expenses`, `admin_users`. View: `storefront_listings`.
- Statuses today: `pending, bought, in_inventory, listed, sold, rejected` (free text, no DB constraint).
- n8n workflow `n8n/Vindera_Daily_Scan.json` posts 3 hardcoded ASINs to `/api/v1/deals/scan` daily 08:15 and calls `/api/v1/deals/dead-stock/scan`.
- There are no tests and no CI. `npm run build` passes; `npm run lint` currently reports ~42 errors (mostly `any` types and `react-hooks/set-state-in-effect`).

### Audit findings this plan must resolve (reference IDs used in the phases)

| ID | Finding |
|---|---|
| S1 | FastAPI has **no authentication**. Anyone reaching the URL can delete/modify deals, read all expenses (`GET /expenses/`), burn Keepa/OpenAI credits (`/scan`, `/chat`). `/docs` and `/metrics` are public. Chatbot has a `delete_asin` tool. |
| S2 | Mock fallbacks (Keepa failure -> fake 45/99 EUR data; OpenAI failure -> fake "profitable, 42.5%" analysis; `random.choice` BuyBox seller) **write fake deals into the production DB** and can trigger "HOT DEAL" pushes. `ENVIRONMENT` setting exists but is unused. |
| S3 | Destructive deletes: chatbot `/delete ASIN` deletes the product and (ON DELETE CASCADE) **all its opportunities including sold, tax-relevant records**; `DELETE /deals/{id}` can delete sold deals. Austrian bookkeeping records must be retained ~7 years. |
| S4 | Invoices upload to a bucket read through `getPublicUrl` (public URLs containing personal data). Bucket/policies are not in migrations. Supabase signups may be enabled on the hosted project. |
| C1 | Profit ignores all logistics/fees: `profit = suggested_price - amazon_price`. No inbound shipping, outbound shipping (Post AT), packaging, Willhaben/payment fees, return reserve. |
| C2 | `profit_margin` stored by the scan pipeline is the **LLM's** `estimated_profit_margin`, not computed from prices. The suggested sell price ("exactly halfway") is also computed by the LLM. Scores (`demand`, `competition`, `deal_score`) are LLM guesses, unbounded, and `deal_score` is not derived from the breakdown. `parsed` can be `None` (model refusal) and crash the pipeline. |
| C3 | Reports use `target_sell_price` as revenue and `target - buy` as profit; they ignore `actual_sell_price`, `actual_profit`, `shipping_and_prep_cost`, `platform_fees`. |
| C4 | The EUR 55,000 Kleinunternehmer progress bar sums **all time**, not the calendar year. |
| C5 | Reports fetch all `opportunities` (all statuses) without pagination; PostgREST silently caps at 1000 rows -> totals silently wrong. |
| C6 | "Returned" flow: sets status back to `in_inventory`, cuts `target_sell_price` by 10% (destroys original), leaves stale `sold_at`/`actual_*`, records no refund. |
| C7 | "Mark as Bought" records no actual purchase price, date, order reference or inbound shipping. `buy_price` remains the scan-time price. |
| C8 | Naive `datetime.now()` timestamps sent to `timestamptz` columns; age/time-to-sell measured from `created_at` (scan date), not purchase/listing date. `profit_margin numeric(5,2)` overflows above 999.99 and the insert failure is only `print`ed. |
| D1 | The scan **inserts a new opportunity on every run** for the same ASIN (n8n -> ~3 rows/day). |
| D2 | Every scan writes 6 **fabricated** `price_history` rows; the chart then presents them as real (not "Sample"). |
| D3 | `storefront_listings` does not exclude `is_quarantine` items. |
| D4 | No `sku` uniqueness; status has no CHECK constraint and API accepts any string; multi-table writes are not atomic; `products` cascade to `opportunities`. |
| D5 | No Amazon return-window tracking (Amazon.de is typically 30 days; dead-stock threshold is 60). |
| D6 | No audit trail of changes to prices/status. |
| R1 | Sync OpenAI/supabase-py calls inside `async def` block the event loop (n8n fires 3 scans at once). `BackgroundTasks` / bare `asyncio.create_task` lose work on restart, no job status, no retries. |
| R2 | Frontend swallows failed mutations silently (`if (res.ok) ...` with no else). |
| R3 | Only `print` logging, no error tracking, no health endpoints. |
| I1 | Everything runs on the owner's Mac via `host.docker.internal`; `uvicorn --reload`; no Dockerfile, no CI, no deploy config; Grafana defaults to password `admin`; Prometheus/Grafana/n8n ports published; n8n has no encryption key/auth config. |
| I2 | No backups. Realtime publication, storage bucket and hosted `events_calendar` rows are not reproducible from migrations. |
| I3 | Storefront is fully client-rendered (poor SEO), fetches all listings unpaginated. |
| L1 | Legal/tax items that only the owner + Steuerberater/lawyer can settle (see `MANUEL-ADIMLAR.md`). You may add technical hooks but must **not** invent legal text. |

---

# PHASES

## PHASE 0 — Recon and setup (small)

- 0.1 `git checkout -b launch-hardening` from `main` (the only expected uncommitted change is this plan file, `docs/LAUNCH-PLAN.md`; it goes into the first commit. Any other uncommitted change: stop and tell the owner).
- 0.2 Read: `CLAUDE.md`, `TECH-DOKUMENTATION.md`, all files under `backend/src`, all migrations, `frontend/src/lib/*`, and the admin pages. Confirm the audit findings above against the code; note deviations.
- 0.3 Create `docs/LAUNCH-PROGRESS.md` (checkbox list of every task ID in this file, plus "Decisions & assumptions", plus "Manual steps pending").
- 0.4 Check tooling availability and report in one line: `uv`, `node/npm`, `docker`, `supabase` CLI (`supabase --version`). Adapt verification accordingly.
- 0.5 Create `docs/MANUEL-ADIMLAR.md` skeleton in **Turkish** (filled in Phase 9, but append items as you discover them).

Done when: branch exists, progress file exists, tooling report printed.

---

## PHASE 1 — Backend authentication and hardening  (S1, S3-chat part)

Goal: nobody except the logged-in admin (or n8n with a secret) can call the API. Backend and frontend change together so the app keeps working.

- 1.1 **`backend/src/core/auth.py`**: FastAPI dependencies.
  - `require_admin`: read `Authorization: Bearer <supabase access token>`; validate with `supabase.auth.get_user(token)` (service-role client already exists); then check membership in `admin_users` via service role. Cache positive results in memory for ~60s keyed by token hash to avoid a network call per request. Return 401 for missing/invalid token, 403 for non-admin. Never log tokens.
  - `require_admin_or_automation`: accepts either a valid admin JWT **or** header `X-Vindera-Key` equal to new setting `AUTOMATION_SHARED_SECRET` (use `hmac.compare_digest`). Used only for `POST /deals/scan` and `POST /deals/dead-stock/scan` (n8n).
  - Apply `require_admin` to **every** router in `deals.py`, `expenses.py`, `chat.py`. Nothing under `/api/v1` may stay public.
- 1.2 **Config** (`core/config.py`): add `AUTOMATION_SHARED_SECRET`, `METRICS_TOKEN`, `SENTRY_DSN` (optional), `ALLOW_MOCK_DATA: bool = False`, `RETURN_WINDOW_DAYS: int = 30`. Actually use `ENVIRONMENT`: in `production`, startup must **fail fast** if `SUPABASE_URL`/service key/`AUTOMATION_SHARED_SECRET`/`METRICS_TOKEN` are missing, if `CORS_ALLOWED_ORIGINS` contains localhost, or if `ALLOW_MOCK_DATA` is true. Remove `FASTAPI_SECRET_KEY` (unused) from config and `.env.example`. Update `.env.example` with all new vars (placeholders only).
- 1.3 **Public surface**: in production disable `/docs`, `/redoc`, `/openapi.json`. Protect `/metrics` with `Authorization: Bearer <METRICS_TOKEN>` (keep the Instrumentator, add a small dependency/middleware) and update `infrastructure/monitoring/prometheus.yml` to send that bearer token (use `authorization: credentials_file` or documented placeholder; do not hardcode a secret).
- 1.4 **Rate limiting**: add `slowapi` (or equivalent). Suggested: `/chat` 20/min, `/deals/scan` 30/min, everything else 120/min per IP/user.
- 1.5 **Input validation** (Pydantic): ASIN regex `^[A-Z0-9]{10}$` (uppercase after strip) in every place an ASIN is accepted (scan, manual, chat); `status` as a `Literal[...]` of the allowed statuses (Phase 2 adds `cancelled`, `written_off` — include them now in the Literal); numeric fields `ge=0` / `gt=0` with sane upper bounds; `willhaben_url` must be `https://` and host `willhaben.at` or `*.willhaben.at`; image URLs `https://`; string length limits on free text.
- 1.6 **Chatbot** (`agents/chatbot_agent.py`, `endpoints/chat.py`): require admin; message max length (e.g. 2000); **remove the `/delete` slash command and the `delete_asin` tool completely**; keep `/list`, `/scan`, `/help` and read-only tools; hold a reference to the scan task (module-level `set` with `add_done_callback(discard)`) and log its exceptions. `/list` output must be limited (e.g. 50 newest).
- 1.7 **CORS**: keep env-driven origins; restrict `allow_methods` to `GET, POST, PUT, PATCH, DELETE, OPTIONS` and `allow_headers` to `Authorization, Content-Type`.
- 1.8 **Frontend `apiFetch`**: create `frontend/src/lib/apiFetch.ts` wrapping `fetch(apiUrl(path), ...)`: attaches `Authorization: Bearer <session.access_token>` (from `supabase.auth.getSession()`), sets JSON headers, and on `401` signs out and redirects to `/admin/login`. It must **throw a readable error** (using FastAPI's `detail`) for non-2xx. Replace every direct `fetch(apiUrl(...))` in admin pages, `CommandBar.tsx`, manual-entry, reports with it. (Silent failures are handled in Phase 4.)
- 1.9 **Security headers** in `frontend/next.config.ts` (`headers()`): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` minimal, and a reasonable `Content-Security-Policy` that allows Supabase (`*.supabase.co` incl. `wss:`), the backend API origin (from env) and the image hosts the storefront uses (check `image_url` usage; if arbitrary hosts are used, allow `https:` for `img-src`). Verify the app still loads (build + review).
- 1.10 **n8n**: update `n8n/Vindera_Daily_Scan.json` so both HTTP nodes send header `X-Vindera-Key` from an n8n credential/variable (placeholder reference, no secret in the JSON) and use a configurable base URL variable instead of hardcoded `host.docker.internal` (keep it working locally by default).

Verification: unauthenticated `curl` to every endpoint returns 401 (write a tiny script `backend/scripts/smoke_auth.sh` documenting expected codes); with a valid admin token calls succeed. Frontend build passes.

Done when: S1 fully closed, chat cannot delete anything, `ALLOW_MOCK_DATA`/`ENVIRONMENT` are honored (mock logic itself is finished in Phase 3).

---

## PHASE 2 — Database migrations  (S3, S4, C7, C8, D1, D3, D4, D5, D6, I2)

Write **new** migration files (split logically, several files are fine). Because the hosted DB may already contain duplicates and legacy data, every constraint-adding migration must first **clean/normalize data safely** (never delete sold rows; for duplicate open rows keep the newest). Do not apply to remote; the owner will run `supabase db push` after taking a backup (documented in `MANUEL-ADIMLAR.md`).

- 2.1 **Statuses**: add `CHECK (status IN ('pending','rejected','bought','in_inventory','listed','sold','cancelled','written_off'))` (make NULL statuses `pending` first). Update `frontend/src/lib/constants.ts` `STATUS_OPTIONS` accordingly and the dashboard tabs (`cancelled`/`written_off` are not shown in the 4 tabs; add them to Product Master filters only).
- 2.2 **Purchase & lifecycle columns on `opportunities`** (all nullable): `purchase_price_actual numeric(10,2)`, `purchased_at timestamptz`, `order_ref text`, `inbound_shipping_cost numeric(10,2)`, `packaging_cost numeric(10,2)`, `received_at timestamptz`, `listed_at timestamptz`, `return_by date`, `deleted_at timestamptz`, `invoice_path text`. Keep `buy_price` as the planned/scan price; the **effective cost** is `coalesce(purchase_price_actual, buy_price)` (document this in a SQL comment and create a helper SQL function or generated view column if convenient).
- 2.3 **Numeric widths**: `profit_margin` -> `numeric(8,2)`. Add `net_profit_estimate numeric(10,2)` and `net_margin_estimate numeric(8,2)` (Phase 3 fills them).
- 2.4 **Foreign keys**: change `opportunities.product_id -> products` and `generated_listings.opportunity_id` behavior so that **products cannot be deleted while opportunities exist** (`ON DELETE RESTRICT`). `price_history` may still cascade from products. Keep `generated_listings` cascade only for non-sold opportunities (simplest: RESTRICT on the new `sale_events` FK, cascade for listings is fine because sold rows can no longer be hard-deleted — Phase 4 enforces soft delete).
- 2.5 **SKU**: unique partial index on `sku` where not null (normalize any duplicates first by suffixing).
- 2.6 **One open scan row per product**: partial unique index on `opportunities(product_id) WHERE status IN ('pending','rejected') AND deleted_at IS NULL` (dedupe existing duplicates first, keep newest, move nothing else).
- 2.7 **`sale_events` table** (immutable ledger; admin SELECT via `is_admin()` only, writes via service role only, same access pattern as `business_expenses`): `id`, `opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE RESTRICT`, `event_type text CHECK (event_type IN ('sale','refund'))`, `amount numeric(10,2) NOT NULL` (sale positive, refund negative), `shipping_cost numeric(10,2) DEFAULT 0`, `platform_fees numeric(10,2) DEFAULT 0`, `occurred_at timestamptz NOT NULL DEFAULT now()`, `note text`, `created_at`. Index on `occurred_at`. Backfill one `sale` event for every existing `sold` opportunity using `actual_sell_price` (fallback `target_sell_price`), `shipping_and_prep_cost`, `platform_fees`, `sold_at`.
- 2.8 **`business_settings` table** (single-row config, admin SELECT, service-role write): `outbound_shipping_eur`, `packaging_eur`, `inbound_shipping_eur` (defaults for new deals), `platform_fee_pct`, `platform_fee_fixed_eur`, `payment_fee_pct`, `return_reserve_pct`, `min_net_margin_pct`, `min_net_profit_eur`, `vat_threshold_eur`, `vat_warn_pct`, `return_window_days`, `listing_legal_footer text`. Insert one row with **placeholder defaults clearly commented as ASSUMPTIONS to be confirmed by the owner** (suggested: outbound 6.90, packaging 1.50, inbound 0, platform_fee_pct 0, payment_fee_pct 0, return_reserve_pct 3, min_net_margin 25, min_net_profit 15, vat_threshold 55000, vat_warn 80, return_window 30, legal footer empty).
- 2.9 **`scan_jobs` table**: `id`, `asin`, `status` (`queued|running|succeeded|rejected|failed`), `error text`, `opportunity_id`, `created_at`, `started_at`, `finished_at`. Admin SELECT, service-role write.
- 2.10 **`watchlist_asins` table** (optional but trivial): `asin` PK, `note`, `active bool default true`, `max_buy_price numeric`, `created_at`. Admin SELECT, service-role write. Seed with the 3 ASINs currently hardcoded in the n8n JSON.
- 2.11 **Audit log**: `audit_log(id, table_name, row_id, action, old_row jsonb, new_row jsonb, changed_by uuid, changed_at)` + trigger function on `opportunities` (UPDATE/DELETE) that records changes to `status`, prices, `deleted_at`, `willhaben_url`. `SECURITY DEFINER`, `SET search_path = public`. Admin SELECT only.
- 2.12 **`storefront_listings` view**: recreate (new migration, `CREATE OR REPLACE VIEW`, same column list + order to avoid breaking; only tighten the `WHERE`): add `AND COALESCE(o.is_quarantine, false) = false AND o.deleted_at IS NULL`. Keep grants. Do not add any new column.
- 2.13 **Private invoice bucket + policies**: `INSERT INTO storage.buckets (id, name, public) VALUES ('invoices','invoices', false) ON CONFLICT ... DO UPDATE SET public = false`; storage policies on `storage.objects` for bucket `invoices` allowing SELECT/INSERT/UPDATE only when `public.is_admin()`. (Existing legacy public objects: see manual steps.)
- 2.14 **Realtime**: idempotent `ALTER PUBLICATION supabase_realtime ADD TABLE public.opportunities` (guard with a `DO $$` that checks `pg_publication_tables`).
- 2.15 **Events for hosted DB**: idempotent migration inserting the same `events_calendar` rows as `seed.sql` (guard with `WHERE NOT EXISTS`), so hosted and local match.
- 2.16 **Atomic write functions (RPC)**: SQL functions (`SECURITY DEFINER`, `SET search_path = public`, `EXECUTE` revoked from `anon`/`authenticated`, granted to `service_role` only): `persist_scan_result(payload jsonb)` (upsert product, refresh-or-insert opportunity per 2.6 rule, insert listing, insert real price points), `create_manual_deal(payload jsonb)`, `update_manual_deal(p_id uuid, payload jsonb)`, `record_sale(p_id uuid, payload jsonb)`, `record_return(p_id uuid, payload jsonb)`. Each runs in one transaction. Phases 3-4 call them via `supabase.rpc(...)`. Keep JSON payload keys aligned with the Python models.
- 2.17 Timestamps: all new timestamp columns are `timestamptz`; the backend will send UTC (Phase 3).

Verification: if Docker + Supabase CLI exist, run `supabase db reset` locally and confirm all migrations + `seed.sql` apply cleanly; run a few manual SQL checks (constraint violations rejected, view hides quarantined rows, anon cannot read new tables). Otherwise review meticulously and record "not executed" in the progress file.

`STOP-ASK`: before you finish this phase, tell the owner (Turkish) that migrations must be applied to the hosted DB only **after a backup**, and give the exact commands (see Phase 9).

---

## PHASE 3 — Profit engine and scan pipeline rewrite  (S2, C1, C2, C8, D1, D2)

- 3.1 **`backend/src/services/profit_calculator.py`** — the **single source of truth** for money math. Pure functions, `Decimal` internally, EUR rounded to 2 places:
  - `total_cost = purchase_price + inbound_shipping + packaging`
  - `platform_fees = sell_price * platform_fee_pct/100 + platform_fee_fixed`
  - `payment_fees = sell_price * payment_fee_pct/100`
  - `return_reserve = sell_price * return_reserve_pct/100`
  - `net_profit = sell_price - total_cost - outbound_shipping - platform_fees - payment_fees - return_reserve`
  - `net_margin_pct = net_profit / total_cost * 100` (margin on cost; document this)
  - `break_even_price` (sell price at which net_profit = 0) and `min_emergency_price = max(sell_price * EMERGENCY_PRICE_RATIO, break_even_price)` so the emergency price never sits below cost.
  - `passes_guardrails(net_profit, net_margin_pct, settings)` using `min_net_margin_pct` / `min_net_profit_eur` from `business_settings` (load with short cache; fall back to constants 25 / 15 only if the row is missing).
  - Fee/shipping inputs come from `business_settings`, overridable per deal (Phase 4 UI).
  - Add `backend/tests/data/profit_golden_vectors.json` (>= 8 hand-verified cases incl. zero-fee, high fee, break-even, rounding edge) used by Phase 7 tests and mirrored by a TypeScript port `frontend/src/lib/profit.ts` (live preview only; the **backend recomputes and stores** on every save).
- 3.2 **Scan pipeline** (`run_deal_scan_pipeline`) rewrite:
  1. Create/update a `scan_jobs` row (`running` -> `succeeded|rejected|failed` with `error`).
  2. Fetch Keepa. If Keepa fails or returns no usable price: when `ALLOW_MOCK_DATA` is false (always in production) mark the job `failed` with a clear reason and **stop** (no DB deal, no push). When true (dev only) use mock data **and** prefix the title with `[MOCK]` and store `buybox_seller='MOCK'`.
  3. Validate `current_price > 0` and `average_historical_price > 0`; otherwise `failed`.
  4. **BuyBox / demand data from Keepa, not random.** Before coding, open the Keepa API docs (WebFetch `https://keepa.com/#!discuss/t/product-object` and the request docs) and verify the exact field names for buy-box seller/FBA/Amazon flags (request needs `buybox=1`), `monthlySold`, sales-rank drops, and price CSVs. Do **not** guess field names. If a field is unavailable, store `buybox_seller='Unknown'`, treat as higher risk in scoring. **Delete `_pick_mock_buybox`** (or keep it only behind `ALLOW_MOCK_DATA`).
  5. Use BuyBox price (if available) for `current_price`, and use a robust reference price (prefer 90-day BuyBox/Amazon average; document the choice; avoid silently substituting third-party marketplace price without flagging `price_source` in the analysis text).
  6. Keepa token/rate-limit handling: read `tokensLeft`/`refillIn` from responses, on HTTP 429 or insufficient tokens mark job `failed` with `retry_after`, and send **one** Pushover "Keepa tokens exhausted" message per day (not per ASIN).
  7. AI analysis: keep `gpt-4o-mini` (or configurable `OPENAI_MODEL`) but: switch to `AsyncOpenAI`; add `Field(ge=0, le=10)` on breakdown scores and `ge=0, le=100` on `deal_score`; handle `parsed is None` / refusal; **compute `deal_score` in code** from the seven breakdown values with documented weights (default equal weights -> 0-100); the LLM only supplies the qualitative fields (reasoning, seasonality, thesis) and the 0-10 scores it can honestly estimate. Pass Keepa facts (sales-rank/monthly-sold, BuyBox seller) into the prompt so `demand` is grounded; tell the model explicitly that it has **no access to Willhaben data** and must state uncertainty. Remove the LLM's authority over `is_profitable` and `estimated_profit_margin`: decide profitability **only in code** via `profit_calculator`.
  8. Sell price: **compute in code** (default strategy = midpoint between current and reference price, configurable ratio `SELL_PRICE_POSITION=0.5`), not by the LLM. The listing generator only writes title/description (drop `suggested_price` from its schema).
  9. Guardrails on **net** profit/margin (3.1). Rejected deals are still persisted (status `rejected`) via the same RPC but never notify.
  10. Persist through `persist_scan_result` RPC (one transaction). Store `net_profit_estimate`, `net_margin_estimate`, `profit_margin` (= net margin), computed `emergency_sell_price` (never below break-even).
  11. **Price history**: stop fabricating. Parse the real Keepa price CSV (Keepa time is minutes since 2011-01-01 UTC: `unix_ms = (keepa_minutes + 21564000) * 60000`; verify against docs) into `price_history`, downsampled to max ~90 points, de-duplicated by `(product_id, recorded_at)`. If no real history is available insert **one** real "today" point and nothing else (the chart then correctly shows "Sample").
  12. Notifications: HOT DEAL push only if not rejected, `deal_score >= 80`, **and** the same ASIN has not been pushed in the last 7 days (track via `scan_jobs`/a `last_alerted_at` on the opportunity).
- 3.3 **Async correctness**: no blocking calls on the event loop. Either make supabase interactions run through `starlette.concurrency.run_in_threadpool`/`asyncio.to_thread`, or make endpoints/pipeline sync `def`; be consistent and document it. Add timeouts and bounded retries with backoff (`tenacity` or manual) for Keepa, OpenAI, Pushover. Serialize scans with an `asyncio.Semaphore(2)` so 3 simultaneous n8n calls do not stampede Keepa/OpenAI.
- 3.4 **Timestamps**: use `datetime.now(timezone.utc)` everywhere; never send naive datetimes. Replace `time_to_sell_days` logic to measure from `listed_at` (fallback `purchased_at`, then `created_at`).
- 3.5 Add endpoint `GET /deals/scans` (admin) returning the latest ~50 `scan_jobs` so failures are visible; wire a small "Scan status" list into the admin dashboard AI terminal area (minimal UI; keep dark-mode support).
- 3.6 **Watchlist**: add `GET /deals/watchlist` (accepts admin JWT or automation key) returning active ASINs; update the n8n workflow to fetch it instead of the hardcoded list (keep the hardcoded list only as a documented fallback note). Admin UI for editing the watchlist is **optional** — if you add a page it needs the dark-mode toggle; otherwise document "edit rows in Supabase table editor" in `MANUEL-ADIMLAR.md`.
- 3.7 Update `ListingGeneratorAgent`: German copy stays; append `business_settings.listing_legal_footer` verbatim when non-empty (owner fills it after legal review). **Do not** write legal wording yourself. Remove the hard claim "Bezahlung: Barzahlung bei Abholung" default wording only if the owner marks it in `business_settings` (make the payment line a configurable setting `listing_payment_text`, default keeps current text).

Verification: unit-level checks for calculator via golden vectors (full pytest suite comes in Phase 7); simulate Keepa failure with `ALLOW_MOCK_DATA=false` and confirm **no** DB row is created and job = failed; simulate the same ASIN scanned twice and confirm a single open row.

---

## PHASE 4 — Lifecycle, accounting and reports  (C3, C4, C5, C6, C7, R2, S3, D5)

Backend:
- 4.1 **State machine** in one place (`backend/src/services/lifecycle.py`): allowed transitions `pending->bought|rejected`, `rejected->pending`, `bought->in_inventory|cancelled`, `in_inventory->listed|written_off`, `listed->sold|in_inventory|written_off`, `sold->` (only via `/return`), `cancelled`/`written_off` terminal. Manual-entry `PUT` may set any valid status (back-filling) but must still pass the `Literal` and be written to the audit log. Illegal transitions -> HTTP 409 with a clear message.
- 4.2 **Status endpoint** `PATCH /deals/{id}/status` refactor: on `bought` require and store `purchase_price_actual`, `purchased_at`, optional `order_ref`, `inbound_shipping_cost`, `packaging_cost`, and set `return_by = purchased_at + RETURN_WINDOW_DAYS`; on `in_inventory` stamp `received_at`; on `listed` stamp `listed_at`; **`sold` no longer handled here** — use new endpoints below. Recompute `net_profit_estimate` when costs change. Optional-field update must allow **clearing** values (use `model_fields_set` instead of `is not None` filtering) — e.g. clearing `willhaben_url`.
- 4.3 `POST /deals/{id}/sale` -> `record_sale` RPC: inserts a `sale` event (amount, shipping, fees, occurred_at UTC), sets status `sold`, `sold_at`, `time_to_sell_days`, fills legacy `actual_*` columns for backward compatibility, computes `actual_profit` **in the backend** with the calculator (client value is ignored).
- 4.4 `POST /deals/{id}/return` -> `record_return` RPC: inserts a `refund` event (negative amount, optional return shipping cost), moves the unit back to `in_inventory` with `is_quarantine=true`, `product_condition='REVIEW NEEDED'`, **keeps the original `target_sell_price`** (owner re-prices deliberately), clears nothing from history (sale event remains), resets `sold_at` to NULL only after the refund event exists.
- 4.5 **Soft delete**: `DELETE /deals/{id}` sets `deleted_at` (and audit-logs) instead of deleting; refuse with 409 if the opportunity has any `sale_events`. Every read path that lists opportunities (backend and frontend selects, dead-stock scan, chat `/list`) must exclude `deleted_at IS NOT NULL`. No endpoint may delete a `products` row.
- 4.6 **Dead stock**: measure age from `received_at` (fallback `purchased_at`, `created_at`); keep the "notify once" behavior. Add **return-window alerts** to the same daily job: for `bought/in_inventory/listed` items with `return_by` within 5 days, send one digest push (stamp a `return_alert_notified_at` column — add it in a new small migration if missing) so the owner can send unsold items back to Amazon in time. Update the dashboard's Dead Stock banner to the same age definition.
- 4.7 **Reports API**: SQL function/view `report_year(p_year int)` (admin-callable via RPC or exposed through backend `GET /reports/summary?year=`) returning, all computed from `sale_events`, `opportunities` and `business_expenses`:
  - `revenue` (sum of sale amounts + negative refunds), `cogs` (effective cost of items sold in the year, refunded items reversed), `shipping`, `platform_fees`, `gross_profit`, `expenses_total`, `profit_before_tax = gross_profit - expenses_total`, units sold, average ROI, monthly series, revenue by category, and `vat_threshold_progress` for the **calendar year**.
  - A second **cash view for the Steuerberater (Einnahmen-Ausgaben logic)**: revenue by `occurred_at` year; purchases by `purchased_at` year; expenses by `incurred_at` year. Label it clearly "Management view vs. cash (E/A) view — tax treatment to be confirmed with your Steuerberater".
  - Pagination is not needed because aggregation is server-side; anything that lists rows must paginate (`range`) and never rely on the 1000-row default.
- 4.8 `GET /reports/export.csv?year=` (admin): sales, purchases and expenses as CSV (UTF-8 with BOM, `;` delimiter, German decimal comma optional flag) for the Steuerberater.

Frontend:
- 4.9 **Reports page** rewrite to use 4.7: year selector (default current year), VAT-threshold bar for the selected calendar year with amber at `vat_warn_pct` and red near the limit, KPI labels: "Gewinn vor Steuern" (with a small note "vor Einkommensteuer und SVS"), management vs cash view toggle, CSV export button. Keep existing look, typography classes and dark mode toggle. Show real error banners when data cannot load.
- 4.10 **Dashboard**: financial panel and category audit use the same aggregate (no more `target_sell_price` as revenue). The "Financial & Risk" figures must exclude soft-deleted rows.
- 4.11 **"Mark as Bought" modal**: fields actual price paid (default = `buy_price`), purchase date (default today), order reference, inbound shipping, packaging; shows live net-profit preview using `profit.ts`; shows the computed return-by date. The **"Item Sold!" modal** posts to `/sale` and shows the backend-computed profit in the success state. **"Returned"** button calls `/return` with a confirm dialog and optional return shipping cost; remove the old 10% target-price cut.
- 4.12 Return-by badge on inventory rows (amber <= 7 days, red when passed) and a hint in the inspector: "Unsold near the return deadline: consider returning to Amazon".
- 4.13 **No silent failures**: every mutation surfaces errors (inline banner or toast component — reuse one small shared component) and only closes modals on success. Fix `updateStatus`, `handleConfirmSale`, `saveWillhabenUrl`, expenses handlers, invoice upload.
- 4.14 **Manual entry**: uses new endpoints/RPCs; adds fields for the new cost columns and an optional "create N identical units" control (creates N opportunities with unique SKUs). Profit preview uses `profit.ts` and shows **net** profit/margin and whether it passes the No-Buy rule. Deleting shows the soft-delete semantics in the confirm text and hides the button for sold deals.
- 4.15 Product Master: add filters for `cancelled`, `written_off`; show effective cost and net profit estimate; CSV export includes the new columns; exclude deleted rows; paginate/limit properly (no reliance on 1000).

Verification: build + tsc + lint clean for touched files; manual scenario script (documented in `docs/MANUAL-TEST-SCRIPT.md`, Turkish): scan -> buy -> receive -> list -> sell -> return -> re-list -> sell again, and confirm ledger/report figures match a hand calculation.

---

## PHASE 5 — Storefront, invoices and SEO  (S4, D3, I3, L1-technical)

- 5.1 **Private invoices**: upload path stored in `opportunities.invoice_path`; the admin UI obtains a **signed URL** (`createSignedUrl`, ~10 min) on click for viewing. Uploads go to the private bucket from Phase 2 (this remains the one allowed browser write; enforce file type `pdf|jpg|png|webp` and size <= 10 MB client-side). Keep displaying legacy `invoice_url` if present but mark "legacy public link — migrate" (see manual steps).
- 5.2 **Storefront data**: paginate/limit (`range`, page size ~24 with "load more") instead of `select('*')` for all; homepage rails fetch limited sets. Use `next/image` (or explicitly justify `<img>` and add width/height + lazy loading). Confirm no internal column is ever selected.
- 5.3 **Product page SEO**: make `/product/[id]` render on the server: `generateMetadata` (title, description from listing text, Open Graph image), `Product` JSON-LD (name, image, offers with `priceCurrency: EUR`, `availability`, `itemCondition`), proper 404 (`notFound()`) for missing/sold items. Add `app/robots.ts` (allow `/`, disallow `/admin`), `app/sitemap.ts` (from `storefront_listings`), `noindex` metadata for `/admin/*`. Keep client components only where interactivity requires it. The Supabase anon client is fine for server reads of the view; keep the public-contract rule.
- 5.4 Show sensible states: sold/removed listing -> friendly "no longer available" page; missing `willhaben_url` -> disabled button with text.
- 5.5 **Legal pages: technical only.** Do not rewrite Impressum/Datenschutz legal wording. Instead: (a) make site owner data (name, address, email, Steuernummer/UID, Gewerbe status) come from **one** small config file `frontend/src/lib/legal.ts` used by both pages so the owner can edit a single file; (b) record in `MANUEL-ADIMLAR.md` the points a lawyer/Steuerberater must review: the Impressum sentence that Vindera is "not the contract party" while the operator is in fact the Willhaben seller, Gewerbeberechtigung "in Vorbereitung", the contact e-mail domain, hosting provider paragraph in the Datenschutzerklärung once hosting is chosen, Gewährleistung/Widerrufsrecht information for shipped sales, Kleinunternehmer invoice note (§ 6 Abs 1 Z 27 UStG), Registrierkassenpflicht for cash sales.

Verification: `npm run build`; view-source of a product page shows server-rendered metadata/JSON-LD; `/robots.txt` and `/sitemap.xml` build.

---

## PHASE 6 — Reliability and observability  (R1, R3)

- 6.1 Replace all `print` in backend with `logging` (JSON-ish structured format via a small formatter; include request id middleware). Never log secrets/tokens/full payloads containing personal data.
- 6.2 Health: `GET /healthz` (process up, no auth) and `GET /readyz` (DB reachable via a cheap query, no auth, no data). Add Docker `HEALTHCHECK` to use `/healthz`.
- 6.3 Optional Sentry: if `SENTRY_DSN` set, init `sentry-sdk[fastapi]`; frontend Sentry only if trivial (else document as manual step). Scrub PII.
- 6.4 Startup task: mark `scan_jobs` stuck in `running` for > 15 min as `failed ("interrupted by restart")`.
- 6.5 Global exception handler returning JSON without stack traces in production.
- 6.6 Prometheus: add simple business metrics (`vindera_scan_jobs_total{status}`, `vindera_keepa_tokens_left`, `vindera_openai_errors_total`) and an example alert rules file `infrastructure/monitoring/alerts.yml` (5xx rate, scan failures, Keepa tokens low) — Alertmanager wiring is a documented manual step.
- 6.7 Frontend: global error boundary pages (`error.tsx`, `not-found.tsx`) and remove console noise. Fix the ~42 lint errors properly (real types instead of `any`, correct hook usage) — do not blanket-disable rules; a few justified `eslint-disable-next-line` with a reason are acceptable.

---

## PHASE 7 — Tests and CI  (no tests today)

- 7.1 Backend: add `pytest`, `pytest-asyncio`, `respx`/`httpx` mocks as dev dependencies (`uv add --dev`). Tests (fast, no network, no real Supabase — fake the client behind a thin interface):
  - `profit_calculator` golden vectors (+ property-style checks: net_profit monotonic in sell price, emergency price >= break-even).
  - Guardrail decisions incl. boundary values (exactly 25% / EUR 15).
  - Lifecycle state machine (all allowed and several illegal transitions).
  - Auth dependencies (missing token 401, non-admin 403, automation key OK, wrong key 401).
  - Keepa parsing (prices in cents, -1 handling, category mapping, Keepa time conversion, failure -> job failed and no persistence when `ALLOW_MOCK_DATA=false`).
  - Dedupe rule (same ASIN twice -> one open row).
  - Report aggregation edge cases if implemented in Python; if in SQL, add `supabase/tests/*.sql` (pgTAP) or a documented SQL smoke script.
- 7.2 Frontend: at minimum `tsc --noEmit`, lint, build in CI. Add a small test runner (Vitest) only for `profit.ts` against the same golden vectors JSON if it is quick; otherwise a Node script check.
- 7.3 `.github/workflows/ci.yml`: on PR/push: backend (`uv sync`, `pytest`), frontend (`npm ci`, `tsc`, `lint`, `build` with dummy public env). Cache dependencies. Do not require secrets.
- 7.4 Update `CLAUDE.md` statements that are no longer true ("no automated tests", "Backend has no lint/test commands", mock-fallback note, `FASTAPI_SECRET_KEY`, dedupe/scan behavior, new tables, new rules: "all money math lives in `profit_calculator.py`", "never hard-delete opportunities", "mock data only when ALLOW_MOCK_DATA").

---

## PHASE 8 — Deployment artifacts  (I1, I2)

Target architecture (recommend this, explain in docs, do not provision anything yourself):
- Frontend on Vercel (or any Node host); Supabase hosted project already in EU (Frankfurt); backend + n8n + monitoring on one small EU VPS (e.g. Hetzner, Germany) with Docker Compose and Caddy for automatic HTTPS.

Create:
- 8.1 `backend/Dockerfile` (multi-stage, `uv`, Python 3.14 as in `.python-version`, non-root user, `uvicorn` **without `--reload`**, 2 workers max, healthcheck) and `backend/.dockerignore`.
- 8.2 `infrastructure/prod/docker-compose.yml`: services `backend`, `n8n`, `caddy`, `prometheus`, `grafana`; only Caddy publishes 80/443; everything else on the internal network; `restart: unless-stopped`; env from a `.env.prod` (add `infrastructure/prod/.env.prod.example`; ensure the real file is git-ignored). n8n: `N8N_ENCRYPTION_KEY`, `N8N_HOST`, `WEBHOOK_URL`, `N8N_PROTOCOL=https`, `N8N_SECURE_COOKIE=true`, user management enabled (owner account created on first visit — documented), persistent volume, `GENERIC_TIMEZONE=Europe/Vienna`; n8n reaches backend via the internal service name. Grafana admin password **required** (no `:-admin` default), served only via Caddy basic-auth or reachable through SSH tunnel (choose one, document).
- 8.3 `infrastructure/prod/Caddyfile`: domains from env (`api.<domain>`, `n8n.<domain>`), security headers, `/metrics` not exposed publicly.
- 8.4 Update `infrastructure/monitoring` to use env-provided password with no insecure default and internal-only Prometheus.
- 8.5 `infrastructure/backup/backup.sh`: `pg_dump` of the Supabase DB (connection string from env, never hardcoded), gzip, optional `age`/`gpg` encryption, retention 30 days, plus a documented cron line and a **restore drill** section. (Recommend Supabase Pro daily backups/PITR in the manual steps; the script is the belt-and-braces layer.)
- 8.6 Frontend env docs: `frontend/.env.example` (public vars only) and README notes for Vercel env vars. No secrets in `NEXT_PUBLIC_*` except the anon key/URL.
- 8.7 `docs/DEPLOY.md` (English): step-by-step production runbook (DNS, VPS bootstrap, compose up, migrations, first admin user, n8n import, smoke tests, rollback).

You must **not** run docker/compose against production or push anything. Validate compose files with `docker compose config` if Docker is available.

---

## PHASE 9 — Documentation and manual-steps guide for the owner

- 9.1 Update `TECH-DOKUMENTATION.md`, `README.md`, `CLAUDE.md` to the new reality (endpoints, tables, auth model, profit formula, lifecycle diagram, env vars, run/test/deploy commands).
- 9.2 **Write `docs/MANUEL-ADIMLAR.md` in Turkish**, for a non-developer: numbered, click-by-click, with exact menu names/commands and "how to verify it worked". Mark each item with priority (**Launch-blocker / Soon / Later**). It must cover at least:
  1. **Backup first, then migrations**: how to make a backup (Supabase Dashboard -> Database -> Backups, or `pg_dump`), then `supabase link` and `supabase db push`, and how to check `supabase migration list`.
  2. **Rotate secrets**: rotate Supabase service-role key, OpenAI, Keepa, Pushover keys if they were ever pasted anywhere; generate `AUTOMATION_SHARED_SECRET`, `METRICS_TOKEN`, `N8N_ENCRYPTION_KEY`, Grafana password (`openssl rand -hex 32`); where each value goes.
  3. **Supabase Dashboard settings**: disable public signups (Authentication -> Providers/Sign In), enable MFA (TOTP) and enroll the admin account, set Site URL/redirect URLs to the production domain, confirm `admin_users` contains only the owner, confirm `invoices` bucket is private and migrate legacy public invoices (download + re-upload through the app, then clear `invoice_url`), confirm Realtime is enabled for `opportunities`, upgrade plan / enable daily backups and PITR, region check.
  4. **Business settings**: which numbers to enter into `business_settings` and where to find them (Österreichische Post Paketpreise, Willhaben Händler/gewerbliche Gebühren and "Sicher bezahlen"/PayPal fees, packaging cost per parcel, realistic return reserve), and how to edit the row (Supabase Table Editor). State that defaults are placeholders.
  5. **Accounts/hosting**: create Hetzner (or chosen) VPS, domain + DNS A records, Vercel project with env vars, Sentry project, UptimeRobot monitor on `/healthz`, Pushover app/token, Keepa plan (explain token limits and that real BuyBox/history need a paid plan), OpenAI billing limit (set a monthly cap).
  6. **n8n**: first-run owner setup, import workflow, set credential/variables, activate, test-execute once, check `scan_jobs`.
  7. **First admin user**: SQL to insert into `admin_users`.
  8. **Legal/tax (cannot be done by software)**: Gewerbeanmeldung (Handelsgewerbe) via WKO/Gewerbeamt/USP before regular sales; Steuerberater questions (Kleinunternehmer threshold treatment incl. tolerance rules, E/A-Rechnung and when purchases are deductible, buying as business vs. private on Amazon, Amazon Business account for invoices in the business name, Registrierkassenpflicht for cash sales, SVS/Einkommensteuer planning, invoice note for Kleinunternehmer); lawyer review of Impressum/Datenschutz/Willhaben listing text (Gewährleistung, Widerrufsrecht/FAGG for shipped sales, the "not the contract party" wording); Willhaben business-seller account and fee terms; Amazon terms/return policy check (return window per category). Provide questions to ask, not answers.
  9. **Go-live checklist** (`docs/LAUNCH-CHECKLIST.tr.md`, Turkish, checkbox list) and a **first-week routine** (daily 5-minute check: Grafana/Sentry, `scan_jobs` failures, Keepa tokens, dead-stock/return-by pushes, weekly ledger check vs. bank/PayPal, monthly export for the Steuerberater).
  10. **Rollback**: how to revert to previous deployment and restore a backup.
- 9.3 Finish `docs/MANUAL-TEST-SCRIPT.md` (Turkish, end-to-end scenario with expected numbers).
- 9.4 Final pass: run all verification commands, update `LAUNCH-PROGRESS.md`, list every deviation from this plan, and print a final Turkish summary with: what is done, what is verified, what is NOT verified (e.g. migrations not run against a real DB), the ordered list of manual steps, and the first three things to do tomorrow.

---

## PHASE 10 — Post-launch backlog (do NOT implement unless the owner asks)

Keepa Deals/Tracking webhooks for discovery beyond the watchlist; Willhaben comparable-price research (manual or compliant data source); watchlist admin UI; auto-generated recurring expenses; multi-quantity lots as a first-class concept; Willhaben-to-Vindera sale sync; agent framework migration; Alertmanager routing; frontend Sentry; i18n.

---

## Definition of done for the whole plan

- Unauthenticated access to the API is impossible except `/healthz`, `/readyz`; chat cannot delete; no hard deletes of sold data anywhere.
- No production path can write mock data; a Keepa/OpenAI failure yields a visible failed `scan_job`, never a fake deal.
- One profit engine; reports match `sale_events` for the selected calendar year; VAT-threshold bar is per calendar year; refunds are represented.
- Actual purchase data captured; return-by tracking works; storefront hides quarantined/deleted/sold items and has SEO basics; invoices are private.
- Migrations reproducible from scratch; backup + deploy runbooks exist; CI runs tests, lint, build.
- `docs/MANUEL-ADIMLAR.md` is complete and in plain Turkish.
