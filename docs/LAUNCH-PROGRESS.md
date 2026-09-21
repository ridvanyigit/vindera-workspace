# Launch hardening progress

Work order: `docs/LAUNCH-PLAN.md`. Branch: `launch-hardening`. One commit per phase, never pushed.
A future session can resume from this file alone: find the first unchecked task and read the matching section of the plan.

## Tooling (checked in Phase 0)

- `uv` 0.9.0, Python 3.14.6 (matches `backend/.python-version`)
- `node` v24.11.0, `npm` 11.18.0
- `docker` 28.4.0, daemon running
- `supabase` CLI 2.117.0, project is linked to the hosted project. Never use `--linked`; local only.

## Tasks

### Phase 0 - Recon and setup

- [x] 0.1 Branch `launch-hardening` created from `main`
- [x] 0.2 Code read, audit findings confirmed (see Decisions)
- [x] 0.3 This file
- [x] 0.4 Tooling report
- [x] 0.5 `docs/MANUEL-ADIMLAR.md` skeleton

### Phase 1 - Backend authentication and hardening

- [x] 1.1 `core/auth.py` (`require_admin`, `require_admin_or_automation`) applied to every router
- [x] 1.2 Config: new settings, production fail-fast, remove `FASTAPI_SECRET_KEY`, `.env.example`
- [x] 1.3 Public surface: docs off in production, `/metrics` bearer token, prometheus.yml
- [x] 1.4 Rate limiting
- [x] 1.5 Input validation (ASIN, status Literal, numeric bounds, URLs)
- [x] 1.6 Chatbot: admin only, delete removed, task reference, `/list` limited
- [x] 1.7 CORS methods/headers
- [x] 1.8 Frontend `apiFetch`
- [x] 1.9 Security headers in `next.config.ts`
- [x] 1.10 n8n workflow: automation key + base URL variable

### Phase 2 - Database migrations

- [x] 2.1 Status CHECK + frontend `STATUS_OPTIONS` / Product Master filters
- [x] 2.2 Purchase and lifecycle columns
- [x] 2.3 Numeric widths, net estimate columns
- [x] 2.4 Foreign keys RESTRICT
- [x] 2.5 SKU unique index
- [x] 2.6 One open scan row per product
- [x] 2.7 `sale_events`
- [x] 2.8 `business_settings`
- [x] 2.9 `scan_jobs`
- [x] 2.10 `watchlist_asins`
- [x] 2.11 `audit_log` + trigger
- [x] 2.12 `storefront_listings` tightened
- [x] 2.13 Private `invoices` bucket + policies
- [x] 2.14 Realtime publication
- [x] 2.15 Events calendar rows for hosted DB
- [x] 2.16 Atomic RPC functions
- [x] 2.17 Timestamps are `timestamptz`

### Phase 3 - Profit engine and scan pipeline

- [x] 3.1 `profit_calculator.py` + golden vectors + `profit.ts`
- [x] 3.2 Scan pipeline rewrite
- [x] 3.3 Async correctness, retries, semaphore
- [x] 3.4 UTC timestamps, time-to-sell basis
- [x] 3.5 `GET /deals/scans` + dashboard scan status list
- [x] 3.6 Watchlist endpoint + n8n
- [x] 3.7 Listing generator legal footer / payment text

### Phase 4 - Lifecycle, accounting and reports

- [x] 4.1 State machine
- [x] 4.2 Status endpoint refactor
- [x] 4.3 `POST /deals/{id}/sale`
- [x] 4.4 `POST /deals/{id}/return`
- [x] 4.5 Soft delete
- [x] 4.6 Dead stock + return-window alerts
- [x] 4.7 Reports API
- [x] 4.8 CSV export
- [x] 4.9 Reports page rewrite
- [x] 4.10 Dashboard aggregates
- [x] 4.11 Bought / Sold / Returned modals
- [x] 4.12 Return-by badge
- [x] 4.13 No silent failures
- [x] 4.14 Manual entry
- [x] 4.15 Product Master
- [x] 4b UI smoke test in a real browser (see Phase 4b below)

### Phase 5 - Storefront, invoices and SEO

- [x] 5.1 Private invoices
- [x] 5.2 Storefront pagination / images
- [x] 5.3 Product page SEO
- [x] 5.4 Sold / missing-URL states
- [x] 5.5 Legal pages config (technical only)

### Phase 6 - Reliability and observability

- [ ] 6.1 Structured logging
- [ ] 6.2 Health endpoints
- [ ] 6.3 Sentry (optional)
- [ ] 6.4 Stuck `scan_jobs` on startup
- [ ] 6.5 Global exception handler
- [ ] 6.6 Prometheus business metrics + alerts
- [ ] 6.7 Error boundaries + lint errors

### Phase 7 - Tests and CI

- [ ] 7.1 Backend tests
- [ ] 7.2 Frontend checks / Vitest
- [ ] 7.3 CI workflow
- [ ] 7.4 CLAUDE.md update

### Phase 8 - Deployment artifacts

- [ ] 8.1 Dockerfile
- [ ] 8.2 Prod compose
- [ ] 8.3 Caddyfile
- [ ] 8.4 Monitoring compose
- [ ] 8.5 Backup script
- [ ] 8.6 Frontend env docs
- [ ] 8.7 `docs/DEPLOY.md`

### Phase 9 - Documentation and manual steps

- [ ] 9.1 Tech docs / README / CLAUDE.md
- [ ] 9.2 `docs/MANUEL-ADIMLAR.md` complete
- [ ] 9.3 `docs/MANUAL-TEST-SCRIPT.md`
- [ ] 9.4 Final pass

## Decisions & assumptions

- Phase 0.1: the plan expected `docs/LAUNCH-PLAN.md` to be uncommitted; it was already committed on `main` (716f344) and the working tree was clean, so branch creation needed no extra commit.
- Audit findings S1, S2, S3, C1, C2, D1, D2 were re-checked against the code and hold as described. `deals.py` is the only place that contains the pipeline, manual entry and status logic.
- Additional facts noticed while reading: `products.gallery_image_urls` and `opportunities.dead_stock_notified_at` / `willhaben_url` / `sold_at` exist; `wishlists` was already dropped; `generated_listings` and `opportunities` currently cascade from their parents; `supabase/config.toml` still has `enable_signup = true` (local only; hosted setting is a manual step).
- Verification runs from a scratch directory with dummy environment variables (never from `backend/`), so `pydantic-settings` cannot pick up the real `/.env` through `env_file="../.env"`. The plan's literal `cd backend && uv run python -c "import src.main"` would load the owner's real keys; the equivalent used here is `uv run --project backend` with `SUPABASE_URL=... AUTOMATION_SHARED_SECRET=... METRICS_TOKEN=...` set inline.
- Local Supabase is not running at the start of Phase 0. Phase 2 verification starts it with `supabase start` (local containers only).

### Phase 1

- FastAPI 0.141 mounts `include_router` lazily (`_IncludedRouter`), so `app.routes` no longer lists the real routes. The first version of the startup guard passed on an empty list. `core/auth.py:assert_routes_protected` now unwraps `original_router`, fails if it finds no routes at all, and was checked against a deliberately unprotected router.
- Routers: `deals.router` and `expenses`/`chat` carry `require_admin` at router level; `deals.automation_router` (scan, dead-stock scan) carries `require_admin_or_automation`. Phase 3.6 puts the watchlist endpoint on `automation_router`.
- `ENVIRONMENT` is a `Literal["development","test","production"]` so a typo such as "prod" fails at startup. In production `AUTOMATION_SHARED_SECRET` and `METRICS_TOKEN` must be at least 32 characters.
- `/metrics` stays open in development while `METRICS_TOKEN` is unset (so the local Prometheus works); production cannot start without it. `infrastructure/monitoring/prometheus.yml` reads the token from `secrets/metrics_token` (git-ignored, example file provided).
- Rate limits (slowapi): chat 20/min, scan 30/min, everything else 120/min per IP, plus a shared 300/min application limit enforced in middleware. The decorator limits run inside the handler, i.e. after authentication, so without the application limit a flood of bad tokens to `/chat` or `/scan` would not be throttled before reaching Supabase. Bad tokens are also rejected locally when they are not JWT-shaped.
- Interim protection against S2 (finished in Phase 3): with `ALLOW_MOCK_DATA=false` a Keepa failure or an OpenAI failure/refusal aborts the scan (nothing is written, no push); `_pick_mock_buybox` is only used when mock data is allowed, otherwise the BuyBox seller is stored as `Unknown`/not FBA. Consequence for local development: without `ALLOW_MOCK_DATA=true` in `.env`, scans without API keys no longer produce sample deals.
- `PATCH /deals/{id}/status` keeps its old "skip null" semantics except for `willhaben_url`, which is written whenever it is sent (blank clears it). Phase 4.2 generalises this with `model_fields_set`.
- Frontend: every backend call goes through `apiFetch`. Because validation is stricter now (for example only `https://…willhaben.at` links), dashboard mutations show failures with `alert(...)`, matching the existing invoice-upload style; Phase 4.13 replaces these with a shared toast.
- n8n: Variables are a paid n8n feature, so the workflow uses a "Header Auth" credential named `Vindera Automation Key` for the secret and the `VINDERA_API_BASE_URL` environment variable (default `http://host.docker.internal:8000`) for the base URL. The local compose sets `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` so the workflow can read it.
- CSP: `script-src` needs `'unsafe-inline'` because Next.js injects inline bootstrap scripts (a nonce policy would force dynamic rendering); `img-src` allows any `https:` because product photos are pasted in as arbitrary URLs. `upgrade-insecure-requests` is only sent for production builds with an https API URL.
- The public `/` route of the backend (a status message) is left until Phase 6.2 replaces it with `/healthz`.
- Lint: still 42 errors, all pre-existing (Phase 6.7). Nothing new was introduced.
- Not verified against a real Supabase: the admin-token path was tested with a fake Supabase client (401/403/200, cache, 503 handling by review). A real end-to-end check with the local Supabase from Phase 2 is attempted at the end of Phase 2.

### Phase 2

Files (all `supabase/migrations/20260921…`, all idempotent, all with a "why" header): `090000` lifecycle columns + status CHECK, `090100` dedupe + uniqueness, `090200` `sale_events`, `090300` RESTRICT + sold-record protection, `090400` `business_settings`, `090500` `scan_jobs` + `watchlist_asins`, `090600` `audit_log`, `090700` storefront view, `090800` private `invoices` bucket, `090900` least-privilege grants, `091000` realtime + events, `091100` RPC functions. Local smoke test: `supabase/tests/phase2_smoke.sql` (115 checks, rolled back).

What was verified, all against the LOCAL Supabase only (`supabase start`, `--local`, never `--linked`):

- Upgrade path: local DB reset to the 10 old migrations, legacy-style dirty data inserted (duplicate SKUs, duplicate pending rows, NULL / padded statuses, three kinds of sold rows, duplicate price points), then the 12 new migrations applied. Result checked row by row.
- Fresh path: `supabase db reset --local` (22 migrations + seed) applies cleanly; `supabase db lint` reports no schema errors; every new migration re-applied a second time without error or data change.
- Real stack, not fakes: real GoTrue tokens through the backend (admin 200, non-admin 403, tampered 401), RPCs called through supabase-py/PostgREST with the SQLSTATE codes intact, browser-role permissions through the REST API, storage bucket privacy/MIME limit/signed URLs.
- NOT verified: anything on the hosted project. The hosted schema was pulled once (`20260916082200_remote_schema.sql`) but its real data was never inspected, so the data-cleaning steps are only tested on synthetic legacy data. That is why a backup comes first (`docs/MANUEL-ADIMLAR.md` M1).

Decisions and deviations:

- Statuses: unknown legacy values make the migration stop with a clear message rather than being guessed. `status` is now NOT NULL with default `pending`.
- Duplicate open scan rows are soft-deleted (`deleted_at`), never hard-deleted. Every read path excludes `deleted_at` since Phase 4.5, so the migrations may be pushed once the owner has taken a backup (Phase 5 still has to fix invoice viewing).
- Beyond the plan, small and in the spirit of rule 4 (write-path): `authenticated` lost every table privilege except SELECT plus column-level UPDATE on `opportunities.invoice_url` / `invoice_path` (`090900`); the initial schema had granted TRUNCATE and friends, which RLS does not stop. Also a DB-level guard: sold units and units with sale events cannot be hard-deleted or soft-deleted (`090300`), and `sale_events` is append-only (UPDATE / DELETE / TRUNCATE raise).
- Also added early so a later migration is not needed: `opportunities.return_alert_notified_at` and `last_alerted_at` (4.6, 3.2.12), `scan_jobs.retry_after` (3.2.6), `business_settings.listing_payment_text` (3.7; default is the existing wording), `price_history` unique index `(product_id, recorded_at)` (3.2.11), `effective_purchase_price(o)` / `effective_total_cost(o)` SQL functions (also usable as PostgREST computed columns).
- `business_settings` defaults are placeholder assumptions, marked as such in the migration and in `MANUEL-ADIMLAR.md` M5.
- `record_return` resets `sold_at`, `listed_at`, `time_to_sell_days` and the legacy `actual_*` / customer columns after writing the refund event (the plan only named `sold_at`); the sale stays in `sale_events` and the old column values stay in `audit_log`. Reason: stale sale figures on an in-stock unit are what audit finding C6 complained about.
- `update_manual_deal` refuses to move a sold deal back or to change its recorded sale amounts (ledger). The lifecycle cost columns are only changed when their key is present in the payload, so an edit form that does not know them cannot wipe what "Mark as Bought" stored.
- `audit_log.changed_by` is only set inside the RPC functions (payload key `actor`) or for browser writes (`auth.uid()`); direct service-role table writes record NULL. Phase 4 should route status changes through RPCs (or pass the actor another way) if that matters.
- PostgREST error codes for Phases 3-4: `22023` bad payload (422), `P0002` not found (404), `55000` wrong state (409), `23505` unique violation (409). supabase-py exposes them as `APIError.code`. The payload keys of each RPC are documented in the header of `20260921091100_atomic_write_functions.sql`.
- Open item for Phase 3: old scans wrote 6 fabricated `price_history` rows each; the migrations leave them alone (deleting data was not asked for). See `MANUEL-ADIMLAR.md` M13.
- Frontend (2.1): `STATUS_OPTIONS` has the two new statuses; Product Master got a status filter (the workspace tabs are unchanged, as planned).

### Phase 3

Files: `services/profit_calculator.py` (money math, Decimal, half-up cents), `services/business_settings.py` (60 s cache), `services/keepa_service.py`, `services/scan_pipeline.py` (pipeline moved out of `deals.py`), `agents/deal_analyzer_agent.py`, `agents/listing_generator_agent.py`, `services/notification_service.py`; frontend `lib/profit.ts`, `components/ScanStatusList.tsx` (opened from the "Scans" button in the AI terminal header); n8n workflow reads the watchlist. Golden vectors: `backend/tests/data/profit_golden_vectors.json` (10 cases, hand-computed; Python and TS both match, checked with one-off scripts, no test runner yet: pytest/Vitest come in Phase 7).

Verified (local Supabase, Keepa/OpenAI/Pushover simulated, 41 checks + 10 Keepa-HTTP checks): failure with mock off writes nothing and closes the job as `failed`; token exhaustion (429/503) -> failed + `retry_after` + one push per day; good deal -> pending with net 19.80 / margin 62.86 on cost 31.50, computed `deal_score`, BuyBox from Keepa, 4 real price days + today; same ASIN twice -> one open row, one listing, no duplicate price points; rejected deal is stored without a listing or an OpenAI listing call; hot-deal push once per 7 days; max 2 scans at once; event loop keeps running during a scan; endpoints (`/scan` -> 202 + `job_id`, `/watchlist`, `/scans`, manual deal, sold via status). `npx tsc` and `npm run build` pass; lint: no new errors (3 in `CommandBar.tsx` are older).
NOT verified: any call to the real Keepa, OpenAI or Pushover (no keys used), so the response shape of a live Keepa answer is unchecked; the hosted database.

Keepa sources (rule in 3.2.4): official Java client `keepacom/api_backend` (`Product.java`, `Stats.java`, `KeepaTime.java`, `Request.java`, `Response.java`, read through WebFetch, i.e. summarised) cross-checked against the `keepa` Python package 1.5.0 (`utils.py`, `constants.py`), which confirmed csv indices, that `*_SHIPPING` series (18 = BUY_BOX_SHIPPING) are `[time, price, shipping]` triples, the 2011-01-01 epoch and `429 = NOT_ENOUGH_TOKEN`. Request: `stats=90, history=1, buybox=1, days=90, domain=3`. Rate limit: HTTP 429 and 503 both count as "tokens exhausted".

Decisions and deviations:

- Prices: buy price = `stats.buyBoxPrice`, else Amazon, else 3rd-party New (flagged `marketplace_new` in `ai_decision`). Reference = `stats.avg90[18]` (90-day BuyBox), else `avg90[0]`, else `avg90[1]`. The reading of `avg90[18]` as a plain cents value is an assumption from the `Stats.java` comment; if a live answer differs the parser falls back to the Amazon average.
- Keepa gives only a seller ID, so `buybox_seller` is `Amazon` (`buyBoxIsAmazon`), `Marketplace (<id>)`, or `Unknown`; no seller names are invented.
- Sell price = midpoint (`SELL_PRICE_POSITION`, default 0.5); `OPENAI_MODEL` is configurable. The model no longer returns `is_profitable`, `estimated_profit_margin` or `deal_score`.
- Beyond the plan, small: `discount` score is computed from the prices; `demand` is capped at 5 without Keepa demand data and `risk_level` at 3 for a seller that is neither Amazon nor FBA (the plan asked for "higher risk"). The LLM schema uses plain integers and the code clamps to 0-10 (instead of `Field(ge, le)` on the schema sent to OpenAI, which could not be tried against the live API); the stored `ScoreBreakdown` does carry the bounds.
- The listing agent no longer sees the buy or reference price (it could quote them); the payment line and the legal footer are appended verbatim from `business_settings`, and the model is told not to write payment or legal wording. Rejected deals get no listing (saves an OpenAI call).
- Mock: only with `ALLOW_MOCK_DATA`, title `[MOCK]`, seller `MOCK`, no price history. A depleted Keepa budget never falls back to mock.
- Price history: last value per UTC day for Amazon and BuyBox (BuyBox includes shipping), at most 90 days, plus one "today" point; a product with neither Amazon nor BuyBox price gets no point (`price_history` has no column for a marketplace price).
- `profit_margin` now holds the NET margin on cost for scans and manual deals (it used to be the LLM's guess or gross markup). Older rows keep their old values.
- Manual entry (`POST/PUT /deals/manual`) now takes net profit, margin and the default emergency price from the calculator (interim until Phase 4.14 moves it to the RPCs). Found while testing: creating a manual deal for an ASIN that already has an open scan row answers 500 with the raw unique-violation text; Phase 4 should map `23505` to 409.
- 3.3: pipeline DB calls use `asyncio.to_thread`, endpoints that only call supabase-py are plain `def` (thread pool), chatbot DB calls and OpenAI clients got timeouts/retries; Keepa (3 attempts, 1 s / 2 s backoff), Pushover (3 attempts) and OpenAI (SDK `max_retries=2`) are bounded.
- 3.4: all `datetime.now()` in `deals.py` are UTC; `time_to_sell_days` counts from `listed_at`, else `purchased_at`, else `created_at` (only in the interim status endpoint; `record_sale` does the same in SQL).
- The "Keepa tokens exhausted" push dedupe is in memory (one per day per process); a restart can repeat it once.
- `CLAUDE.md` still describes the old mock BuyBox and the hardcoded n8n list; it is rewritten in Phase 7.4 / 9.1.
- n8n: JSON re-serialised (indentation changed, so the diff is noisy); it now fetches the watchlist. Owner must re-import it (`MANUEL-ADIMLAR.md` M11).

### Phase 4

Files: backend `services/lifecycle.py` (state machine), `services/db_util.py` (`call_rpc` maps SQLSTATE 22023/P0002/55000/23505 to 422/404/409/409, `fetch_all` pages past the 1000-row cap), `services/inventory_alerts.py` (dead stock + return deadlines, moved out of `deals.py`), `api/endpoints/reports.py` (`GET /reports/summary`, `GET /reports/export.csv`), `deals.py` (status refactor, `POST /{id}/sale`, `POST /{id}/return`, soft delete, manual entry through the RPCs), `profit_calculator.actual_profit`; migration `20260921091200_report_summary.sql` (`report_summary(year)`); `tzdata` added to the backend dependencies (Europe/Vienna on slim images). Frontend: `components/{Toast,ModalShell,BoughtModal,SaleModal,ReturnModal}.tsx`, `lib/{fetchAll,lifecycle,useBusinessConfig,reportTypes}.ts`, `profit.ts` (+ `actualProfit`), rewritten Reports page, patched Workspace / Manual Entry / Product Master. Turkish docs: `docs/MANUAL-TEST-SCRIPT.md` (first version), `MANUEL-ADIMLAR.md` M16.

Verified (local Supabase, auth overridden, no external services; 79 checks): state machine (legal and illegal moves, unknown id, race-safe compare-and-set), bought record + return-by + estimate recompute, sale (profit computed in the backend, client value ignored, second sale 409), return (refund event, quarantine, target price kept, sale history kept), re-list and re-sell, soft delete (sold or with sale history 409, hidden from every read path and the storefront, product row kept), report against a hand calculation (revenue / COGS / shipping / fees / gross / before-tax / ROI / VAT % / cash view), previous year empty, CSV (BOM, `;`, decimal comma, formula guard), manual entry through the RPCs (quantity 3 -> 3 SKUs, duplicate open row and duplicate SKU -> 409 with readable text, PUT keeps purchase fields that were not sent), inventory alerts (age from `received_at`, return-by 3 days, deleted/overdue units ignored, announced once), `fetch_all` past 1000 rows (1006 expenses in the report). Frontend: `tsc`, `npm run build`, lint has no new errors (34 -> 28 on the touched pages, all older); profit/lifecycle helpers checked with a Node script (12 checks).
NOT verified: the UI was never opened in a browser (modals, toasts, dark mode, Reports page were only type-checked and built); real Supabase auth tokens on the new endpoints (auth is overridden in the test, as in Phase 1 tests); anything on the hosted project.

Decisions and deviations:

- Sale is accepted from `in_inventory` as well as `listed` (goods handed over without an ad); the plan named only `listed -> sold`. `bought -> sold` is refused (the RPC would allow it, the endpoint does not).
- Status changes are plain updates with a compare-and-set on the old status, not an RPC, so `audit_log.changed_by` is NULL for them (old/new rows and time are still logged). Sale, return and manual entry pass the actor.
- `actual_profit` counts a cost that was never recorded as zero (same rule as `report_summary`), so a deal's profit and the report agree. Estimates (`net_profit_estimate`) still use the `business_settings` defaults for missing inbound/packaging.
- Report definitions (also in the migration header): revenue = sale amounts minus refunds by Vienna calendar year; COGS = effective cost of sold units, reversed by a refund; ROI = gross profit / COGS; cash view purchases = effective cost of bought units by purchase date (fallback receipt, then scan date, flagged); VAT % = year revenue / `vat_threshold_eur`. Cash view is a management aid only; how purchases are deducted is for the Steuerberater.
- Emergency price: recomputed only when cost or target changes, and only lifted (never lowered) to break-even; a manually typed emergency price is respected.
- Dashboard: revenue, gross profit, ROI and the VAT bar come from `/reports/summary` for the current year; inventory value uses effective cost (planned or paid price + inbound + packaging); category audit is this year's ledger figures. `Drop price 5%` and the 60-day banner now count from receipt/purchase.
- The workspace invoice upload still writes a public URL (`getPublicUrl`) into a bucket that is private since Phase 2, so opening invoices fails until Phase 5.1 switches to `invoice_path` + signed URLs; only its error handling was fixed here.
- Manual entry: `actual_profit` is no longer accepted from the client; `quantity` (1-50) creates identical units with suffixed SKUs. The old `Delete` button is now `Remove` and hidden for sold deals.
- `/dead-stock/scan` (n8n) now runs both alerts; no workflow change needed.

### Phase 4b: UI smoke test

Run against local Supabase only (db reset, auth NOT overridden: a local admin logged in through the real login page, so the new endpoints were called with real Supabase access tokens). Headless Chrome driven by Playwright from the scratchpad; the built-in browser tools were not available in the session. Backend on :8100 and a copy of `frontend/` (without `.env.local`) on :3100, every setting inline, Keepa/OpenAI/Pushover empty. The developer's own servers on :8000 and :3001 were already running and were not touched. Text-based reading, no screenshots.

Tested (all against `docs/MANUAL-TEST-SCRIPT.md`): login; manual deal (profit box +29.80 / 138.6 %, duplicate pending row -> readable 409); Mark as Bought modal (total 23.00, 28.30 / 123.0 %, return-by +30 days, stored correctly); receive and approve; Listed; Willhaben URL validation (bad host rejected, good saved); Manual Entry shows the purchase record; Item Sold modal (30.10 / 130.9 %, DB matches); no Sold/Remove actions on a sold card; Return (quarantine, target price kept, refund event); Resolve and re-list; re-sale 70/5/1.50 -> actual profit 40.50; Reports (management: revenue 70.00, cost 23.00, shipping 16.40, fees 1.50, gross 29.10, ROI 126.5 %, before-tax 19.10 after a 10.00 expense; cash view: 70.00 / 23.00 / 27.90 / 19.10); year selector to another year (revenue 0, VAT 0 %); VAT bar colour (indigo, amber at 87.5 %, red at 97.2 %); CSV export (BOM, `;`, decimal comma, the expected nine lines); Product Master (paging text, deleted rows excluded, CSV columns); Remove of a pending and of a listed deal (hidden from workspace, Product Master and storefront; product page shows "not available"); storefront as anonymous visitor (pending, quarantined, sold and deleted units hidden; in-inventory and listed units visible); dark mode toggle plus a scan for light surfaces on Workspace, deal detail, Sale modal, Return modal, Reports, Product Master, Manual Entry (none); error feedback with the backend stopped (toast on Save, error inside the open Sale modal, Reports error banner with Retry).

Found and fixed:
- Hydration error on every admin page when the stored theme was dark: `useDarkMode` read `localStorage` in a `useState` initialiser, so the first client render differed from the server HTML. Now `useSyncExternalStore` (server snapshot = light), with an in-memory fallback when storage is blocked.
- Reports: the VAT limit and the year revenue were formatted with different locales ("EUR 70.00 / EUR 55 000,00"); both now use the same grouping.
- 422 messages showed Pydantic's "Value error, " prefix ("willhaben_url: Value error, URL must point to willhaben.at"); the prefix is stripped in `describeError`.
- `docs/MANUAL-TEST-SCRIPT.md`: break-even in 1.2 is 29.28 (30.82 is the cost after purchase), the VAT text shows "0.1% used", the year selector lists only years that have data (how to test it added), VAT colour steps added.

Observations, left as they are (not bugs against the plan):
- "Item Sold!" is offered only on `listed` cards; a sale from `in_inventory` works through the API only.
- Product Master shows the net profit ESTIMATE also for sold rows, not the actual profit.
- Approving the quality check shows no success toast (the card just moves).

NOT tested: the Bought modal and the Manual Entry `Units` field / back-fill statuses were not exercised in the dark scan or with quantity > 1 (same components / API-tested in Phase 4); invoice upload and viewing (broken until Phase 5.1); the `/dead-stock/scan` alert flow through the UI; the 401 sign-out redirect; Realtime refresh after a scan; any real Keepa/OpenAI/Pushover call; CSV opened in Excel itself (only the file bytes); phone-width layout; browsers other than Chrome; the hosted project. Machine note: on this Mac the first read of a file costs about one second (a scan of some kind), so a cold backend start after a long idle can take minutes; warm the cache with `find backend/.venv -type f | xargs -P 48 cat > /dev/null`.

### Phase 5

Files: frontend `lib/{invoices,storefront,legal,site,supabaseServer}.ts`, `components/{ListingImage,ProductGallery,RecordView}.tsx`, `app/{robots,sitemap}.ts`, `app/admin/layout.tsx`, `app/product/[id]/{page,not-found}.tsx`; patched `app/page.tsx`, `admin/page.tsx`, `ProductCard`, `CategoryQuadTile`, `StoreNav`, `StoreFooter`, Impressum, Datenschutz, root layout. Turkish docs: `MANUEL-ADIMLAR.md` M8 (rewritten), M17 (legal review points), M18 (`NEXT_PUBLIC_SITE_URL`).

Verified (local Supabase, isolated backend :8100 and a frontend copy :3100, no external services): invoice flow in Chrome (wrong type and 20 MB file refused with a readable toast, PDF uploaded to `invoices/<deal id>/<timestamp>.pdf`, `invoice_path` saved, "View Invoice" opens a signed URL that answers 200; a legacy public link answers 400 to an anonymous request and opens through a signed URL for the admin); product page view-source (title, description, canonical, Open Graph image, Product JSON-LD with `EUR`, price, availability, condition; ad copy containing `</script>` cannot break out of the JSON-LD); 404 with the friendly page for a quarantined, sold, unknown and malformed id; disabled "Bald verfügbar" button plus hint without a Willhaben URL; `/robots.txt`, `/sitemap.xml` (only sellable items), `noindex` on `/admin/*`; homepage requests only the card columns with `limit=60`, a category grid loads 24 then "Load more" (24 + 6), recently viewed is fetched by id. `tsc` clean, `next build` passes (run in a copy of `frontend/`, not the real `.next`); lint shows nothing new (the 3 errors it lists in Impressum, Datenschutz and StoreNav are older and belong to Phase 6.7).
NOT verified: a production build served with `next start` (dev server used for the runtime checks; the build itself passed); real product photos (test rows use dummy image URLs); the sitemap with more than 1000 rows; what Google actually indexes.

Decisions and deviations:
- `next/image` with `unoptimized` (`ListingImage`): photos are pasted in as arbitrary https URLs, and allow-listing every host (or `**`) would turn `/_next/image` into an open image proxy. Lazy loading and layout-shift protection stay; anything that is not an https URL shows the placeholder.
- The product page is a server component with `revalidate = 60`; the gallery and the "recently viewed" recorder are small client components; the accordions are native `<details>`. A sold item may stay visible for up to a minute.
- Homepage rails are built from the newest 60 listings; a per-category rail shows at most 12 (the category page has them all). "Recently Viewed" asks for exactly the remembered ids.
- Legacy invoices: the storage path is recovered from the old public URL and opened through a signed URL ("View Invoice (legacy)"), so no data has to be migrated or cleared for viewing.
- Legal: `legal.ts` only holds the facts; no legal wording was written or changed (the lawyer questions are in M17).
- `CLAUDE.md` still says every page is client-rendered and mentions `invoice_url`; it is rewritten in Phase 7.4 / 9.1.

## Manual steps pending

Collected in `docs/MANUEL-ADIMLAR.md` (Turkish), M1-M16. Launch-blockers so far: M1 backup then `supabase db push`, M2 disable signups, M3 new secrets, M4 n8n credential, M5 `business_settings` numbers, M6 Prometheus token file, M7 storage policy check.
