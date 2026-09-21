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
- [ ] 2.1 Status CHECK + frontend `STATUS_OPTIONS` / Product Master filters
- [ ] 2.2 Purchase and lifecycle columns
- [ ] 2.3 Numeric widths, net estimate columns
- [ ] 2.4 Foreign keys RESTRICT
- [ ] 2.5 SKU unique index
- [ ] 2.6 One open scan row per product
- [ ] 2.7 `sale_events`
- [ ] 2.8 `business_settings`
- [ ] 2.9 `scan_jobs`
- [ ] 2.10 `watchlist_asins`
- [ ] 2.11 `audit_log` + trigger
- [ ] 2.12 `storefront_listings` tightened
- [ ] 2.13 Private `invoices` bucket + policies
- [ ] 2.14 Realtime publication
- [ ] 2.15 Events calendar rows for hosted DB
- [ ] 2.16 Atomic RPC functions
- [ ] 2.17 Timestamps are `timestamptz`

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

## Manual steps pending

Collected in `docs/MANUEL-ADIMLAR.md` (Turkish). Items added so far are listed there under "Bulunan maddeler".
