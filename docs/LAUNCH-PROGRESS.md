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
- [ ] 1.1 `core/auth.py` (`require_admin`, `require_admin_or_automation`) applied to every router
- [ ] 1.2 Config: new settings, production fail-fast, remove `FASTAPI_SECRET_KEY`, `.env.example`
- [ ] 1.3 Public surface: docs off in production, `/metrics` bearer token, prometheus.yml
- [ ] 1.4 Rate limiting
- [ ] 1.5 Input validation (ASIN, status Literal, numeric bounds, URLs)
- [ ] 1.6 Chatbot: admin only, delete removed, task reference, `/list` limited
- [ ] 1.7 CORS methods/headers
- [ ] 1.8 Frontend `apiFetch`
- [ ] 1.9 Security headers in `next.config.ts`
- [ ] 1.10 n8n workflow: automation key + base URL variable

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
- Local Supabase is not running at the start of Phase 0. Phase 2 verification starts it with `supabase start` (local containers only).

## Manual steps pending

Collected in `docs/MANUEL-ADIMLAR.md` (Turkish). Items added so far are listed there under "Bulunan maddeler".
