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

- [ ] 3.1 `profit_calculator.py` + golden vectors + `profit.ts`
- [ ] 3.2 Scan pipeline rewrite
- [ ] 3.3 Async correctness, retries, semaphore
- [ ] 3.4 UTC timestamps, time-to-sell basis
- [ ] 3.5 `GET /deals/scans` + dashboard scan status list
- [ ] 3.6 Watchlist endpoint + n8n
- [ ] 3.7 Listing generator legal footer / payment text

### Phase 4 - Lifecycle, accounting and reports

- [ ] 4.1 State machine
- [ ] 4.2 Status endpoint refactor
- [ ] 4.3 `POST /deals/{id}/sale`
- [ ] 4.4 `POST /deals/{id}/return`
- [ ] 4.5 Soft delete
- [ ] 4.6 Dead stock + return-window alerts
- [ ] 4.7 Reports API
- [ ] 4.8 CSV export
- [ ] 4.9 Reports page rewrite
- [ ] 4.10 Dashboard aggregates
- [ ] 4.11 Bought / Sold / Returned modals
- [ ] 4.12 Return-by badge
- [ ] 4.13 No silent failures
- [ ] 4.14 Manual entry
- [ ] 4.15 Product Master

### Phase 5 - Storefront, invoices and SEO

- [ ] 5.1 Private invoices
- [ ] 5.2 Storefront pagination / images
- [ ] 5.3 Product page SEO
- [ ] 5.4 Sold / missing-URL states
- [ ] 5.5 Legal pages config (technical only)

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
- Duplicate open scan rows are soft-deleted (`deleted_at`), never hard-deleted. Until Phase 4.5 makes every read path exclude `deleted_at`, those hidden rows still show up in the UI, so the migrations must not be pushed before Phase 4.
- Beyond the plan, small and in the spirit of rule 4 (write-path): `authenticated` lost every table privilege except SELECT plus column-level UPDATE on `opportunities.invoice_url` / `invoice_path` (`090900`); the initial schema had granted TRUNCATE and friends, which RLS does not stop. Also a DB-level guard: sold units and units with sale events cannot be hard-deleted or soft-deleted (`090300`), and `sale_events` is append-only (UPDATE / DELETE / TRUNCATE raise).
- Also added early so a later migration is not needed: `opportunities.return_alert_notified_at` and `last_alerted_at` (4.6, 3.2.12), `scan_jobs.retry_after` (3.2.6), `business_settings.listing_payment_text` (3.7; default is the existing wording), `price_history` unique index `(product_id, recorded_at)` (3.2.11), `effective_purchase_price(o)` / `effective_total_cost(o)` SQL functions (also usable as PostgREST computed columns).
- `business_settings` defaults are placeholder assumptions, marked as such in the migration and in `MANUEL-ADIMLAR.md` M5.
- `record_return` resets `sold_at`, `listed_at`, `time_to_sell_days` and the legacy `actual_*` / customer columns after writing the refund event (the plan only named `sold_at`); the sale stays in `sale_events` and the old column values stay in `audit_log`. Reason: stale sale figures on an in-stock unit are what audit finding C6 complained about.
- `update_manual_deal` refuses to move a sold deal back or to change its recorded sale amounts (ledger). The lifecycle cost columns are only changed when their key is present in the payload, so an edit form that does not know them cannot wipe what "Mark as Bought" stored.
- `audit_log.changed_by` is only set inside the RPC functions (payload key `actor`) or for browser writes (`auth.uid()`); direct service-role table writes record NULL. Phase 4 should route status changes through RPCs (or pass the actor another way) if that matters.
- PostgREST error codes for Phases 3-4: `22023` bad payload (422), `P0002` not found (404), `55000` wrong state (409), `23505` unique violation (409). supabase-py exposes them as `APIError.code`. The payload keys of each RPC are documented in the header of `20260921091100_atomic_write_functions.sql`.
- Open item for Phase 3: old scans wrote 6 fabricated `price_history` rows each; the migrations leave them alone (deleting data was not asked for). See `MANUEL-ADIMLAR.md` M13.
- Frontend (2.1): `STATUS_OPTIONS` has the two new statuses; Product Master got a status filter (the workspace tabs are unchanged, as planned).

## Manual steps pending

Collected in `docs/MANUEL-ADIMLAR.md` (Turkish), M1-M14. Launch-blockers so far: M1 backup then `supabase db push`, M2 disable signups, M3 new secrets, M4 n8n credential, M5 `business_settings` numbers, M6 Prometheus token file, M7 storage policy check.
