# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

Each service starts independently. Run from the workspace root:

```bash
# Backend API (port 8000)
cd backend && uv run uvicorn src.main:app --reload

# Frontend (port 3000)
cd frontend && npm run dev

# Local Supabase (Docker; never link it to the hosted project by accident)
supabase start

# n8n automation (port 5678)
cd n8n && docker compose up -d

# Prometheus + Grafana monitoring (Grafana port 3002)
cd infrastructure/monitoring && docker compose up -d
```

## Build, lint and test

```bash
# Backend (from backend/): fast, no network, no real Supabase/Keepa/OpenAI/Pushover
uv run pytest -q

# Frontend (from frontend/)
npx tsc --noEmit && npm run lint && npm test && npm run build

# SQL checks (local Supabase running, after `supabase db reset --local`)
docker exec -i supabase_db_vindera-workspace psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/phase2_smoke.sql
docker exec -i supabase_db_vindera-workspace psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/report_summary_smoke.sql
```

CI (`.github/workflows/ci.yml`) runs all of the above without any secret. `npm run build` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_API_URL`; dummy values are fine.

The backend tests never read `/.env`: `tests/conftest.py` sets its own environment, imports the app from a scratch directory, swaps every Supabase client for the in-memory `tests/fakes.py` and blocks outgoing sockets. A test that forgets a stub fails instead of calling a real service. Keep it that way.

## Environment setup

Two separate env files are required locally:

- `/.env` (workspace root) - loaded by the backend via `env_file="../.env"` in `backend/src/core/config.py`
- `/frontend/.env.local` - loaded by Next.js

Copy `.env.example` and fill in keys. `OPENAI_API_KEY`, `KEEPA_API_KEY` and `PUSHOVER_*` are optional locally. Without a key the corresponding call is **not made**: a scan then ends as a `failed` scan job, never as a fake deal. Fake data exists only when `ALLOW_MOCK_DATA=true` (development only; titles start with `[MOCK]`, the BuyBox seller is `MOCK`).

`ENVIRONMENT=production` makes the backend refuse to start unless `SUPABASE_URL`, the service key, `AUTOMATION_SHARED_SECRET` and `METRICS_TOKEN` (32+ characters each) are set, `CORS_ALLOWED_ORIGINS` has no localhost entry and `ALLOW_MOCK_DATA` is false. It also switches off `/docs`, `/redoc` and `/openapi.json`.

`SUPABASE_ANON_KEY` in `.env.example` is **not** read by the backend `Settings` class; it only belongs in `frontend/.env.local`.

## Database migrations

```bash
supabase db reset --local    # local DB + all migrations + seed.sql
supabase db push             # hosted project: only the owner does this, after a backup (docs/MANUEL-ADIMLAR.md M1)
```

Never use `--linked`, `db push` or anything else that touches the hosted project unless the owner asked for it in that very message.

**Never edit an already-applied migration.** Always create a new file: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`, idempotent where feasible, with a header comment that says why. `seed.sql` only runs on `db reset`.

## Architecture

### Two UIs in one Next.js app

| Surface | Routes | Auth |
|---|---|---|
| Public storefront | `/`, `/product/[id]`, `/impressum`, `/datenschutz`, `robots.txt`, `sitemap.xml` | None (anon) |
| Admin back office | `/admin/*` (`noindex`) | Supabase auth + `is_admin()` RPC |

The storefront home and admin pages are client components. `/product/[id]` is a **server component** (metadata, Open Graph, Product JSON-LD, 404 via `notFound()`, `revalidate = 60`). Every admin page needs the dark/light toggle (`useDarkMode`) and the `vindera-admin` root class.

### Authentication and admin access

- Every `/api/v1/*` route of the backend requires `Authorization: Bearer <Supabase access token>` of an account listed in `admin_users` (`core/auth.py`, `require_admin`). The token check is cached for 60 s.
- `POST /deals/scan`, `POST /deals/dead-stock/scan` and `GET /deals/watchlist` also accept the n8n header `X-Vindera-Key` (`AUTOMATION_SHARED_SECRET`).
- `/metrics` needs `Authorization: Bearer <METRICS_TOKEN>`. The only public backend routes are `/healthz` and `/readyz`.
- `main.py` calls `assert_routes_protected`: a new `/api/v1` router without an auth dependency makes the app refuse to start.
- Admins sign in at `/admin/login`. `is_admin()` is a SECURITY DEFINER function over `admin_users`, which has RLS enabled with no policies (invisible to browsers). Provision an admin with `INSERT INTO public.admin_users (user_id, email) SELECT id, email FROM auth.users WHERE email = '...'`. There is no self-service signup.
- The frontend calls the backend only through `frontend/src/lib/apiFetch.ts` (attaches the token, signs out on 401, throws readable errors).

### The write-path rule

**All mutations from the frontend go through the FastAPI backend** (service role, bypasses RLS). The browser's Supabase role can only SELECT, plus column-level UPDATE of `opportunities.invoice_url` / `invoice_path`. The single browser write is the invoice file upload to the **private** `invoices` bucket (`frontend/src/lib/invoices.ts`); files are opened through 10-minute signed URLs. When adding a feature that writes data, add a backend endpoint (and, for multi-table writes, a SQL function in a migration).

Multi-table writes are atomic RPC functions (`persist_scan_result`, `create_manual_deal`, `update_manual_deal`, `record_sale`, `record_return`), executable by `service_role` only. `services/db_util.py:call_rpc` maps their SQLSTATE codes to HTTP errors (22023 -> 422, P0002 -> 404, 55000 -> 409, 23505 -> 409).

### Public data contract: `storefront_listings` view

The storefront reads only the `storefront_listings` view. It shows only `in_inventory` / `listed` units that are not quarantined and not soft-deleted, exposes only customer-safe columns (no buy price, margin, thesis) and is readable by `anon`. Adding a column to `products` or `opportunities` does **not** expose it; that needs a new migration. Server code uses `lib/supabaseServer.ts` (anon key, no session).

### Money: one profit engine

**All money math lives in `backend/src/services/profit_calculator.py`** (Decimal, cents rounded half away from zero at every step; net profit, margin on cost, break-even, emergency price, guardrails). `frontend/src/lib/profit.ts` is a preview-only port; both are tested against `backend/tests/data/profit_golden_vectors.json`. The backend recomputes and stores its own figures on every save; a client-sent profit is never trusted. The owner's numbers (shipping, packaging, fees, minimum margin/profit, VAT threshold, return window, listing texts) are the single `business_settings` row, cached for 60 s.

The No-Buy guardrail: a deal needs net margin >= `min_net_margin_pct` AND net profit >= `min_net_profit_eur` (both from `business_settings`; equal counts as passing).

### Lifecycle and ledger

Statuses (`opportunities.status`, CHECK constraint): `pending, rejected, bought, in_inventory, listed, sold, cancelled, written_off`. `services/lifecycle.py` is the only place that defines legal transitions (illegal -> HTTP 409); `sold` is reached only through `POST /deals/{id}/sale`, and a customer return goes through `POST /deals/{id}/return` (refund event, unit back in `in_inventory` in quarantine, target price kept).

Sales and refunds are rows in the append-only `sale_events` ledger. **Never hard-delete opportunities:** `DELETE /deals/{id}` sets `deleted_at` and is refused (409) for a unit with a sale; a product row is never deleted. Every read of opportunities excludes `deleted_at IS NOT NULL`. Changes to status, prices and links are recorded in `audit_log` by trigger.

The effective cost of a unit is `coalesce(purchase_price_actual, buy_price) + inbound_shipping_cost + packaging_cost`. `return_by` (purchase date + return window) drives the return-deadline alerts and the badge in the workspace.

### Backend scan pipeline

`POST /api/v1/deals/scan` accepts an ASIN, creates a `scan_jobs` row and returns 202 with the job id. The work runs in the background (`services/scan_pipeline.py`, at most 2 at once):

```
Keepa (price, BuyBox, demand, real price history) -> profit_calculator (sell price = midpoint of
today's and the 90-day price, net profit, guardrails) -> DealAnalyzerAgent (qualitative scores only;
deal_score computed in code) -> ListingGeneratorAgent (German copy, payment text and legal footer
appended verbatim from business_settings) -> persist_scan_result RPC -> Pushover (hot deal: score >= 80,
once per product per 7 days)
```

Every outcome ends on the scan job (`succeeded | rejected | failed`, visible in the dashboard's "Scans" list). A Keepa or OpenAI failure fails the job and writes nothing. Rejected deals are stored (`rejected`) without listing copy and never notify. Scanning the same ASIN again refreshes its single open row instead of adding one. Jobs left `running`/`queued` by a restart are closed on startup.

The watched ASINs are the `watchlist_asins` table (edit rows in the Supabase table editor); `n8n/Vindera_Daily_Scan.json` fetches them from `GET /deals/watchlist`.

### Observability

JSON logs on stdout with a request id (`core/logging_config.py`; secrets are masked, request bodies are not logged), `/healthz` and `/readyz`, optional Sentry (`SENTRY_DSN`, PII scrubbed), Prometheus metrics (`vindera_scan_jobs_total`, `vindera_keepa_tokens_left`, `vindera_openai_errors_total`) with alert rules in `infrastructure/monitoring/alerts.yml`. **Metrics are per process: run exactly one uvicorn worker.**

### Category list: must stay in sync

`backend/src/core/categories.py` (`CANONICAL_CATEGORIES`) and `frontend/src/lib/constants.ts` (`PRODUCT_CATEGORIES`) define the same list. **Both must be updated together**; there is no automated check.

### Supabase Realtime

The admin dashboard subscribes to `postgres_changes` on `opportunities` to refresh after a background scan. The publication is part of the migrations. For new tables the admin should react to live, follow the same pattern in `frontend/src/app/admin/page.tsx`.

## Frontend conventions

### TailwindCSS v4

This project uses Tailwind v4 (`@import "tailwindcss"` in `globals.css`), not v3. There is no `tailwind.config.js`.

### Typography classes

`globals.css` defines semantic component classes. Use these instead of ad-hoc `text-[px]` values:

| Class | Use |
|---|---|
| `.type-page-title` | Route-level h1 |
| `.type-section-title` | Card / panel heading |
| `.type-label` | Uppercase eyebrow labels |
| `.type-metric` | KPI / price figures |
| `.type-body` | Secondary body copy |

### ProductCard sizing

`ProductCard` accepts a `size` prop (`standard`/`compact`/`large`/`tall`) that changes internal proportions only. The outer width is always set by the parent (grid or `HorizontalRail` slot). Never set width inside `ProductCard`.

### Other

Product photos are pasted-in https URLs, shown through `ListingImage` (`next/image` with `unoptimized`, because allow-listing arbitrary hosts would turn `/_next/image` into an open proxy). Owner data for the legal pages lives in `frontend/src/lib/legal.ts`; do not write legal wording, the owner's lawyer does.

## Known mocks / incomplete features

- **Mock data** (Keepa/OpenAI stand-ins) exists only behind `ALLOW_MOCK_DATA=true` and is always marked `[MOCK]`.
- **Price history chart** shows real Keepa points; with fewer than 2 points it falls back to a deterministic sample curve and labels it "Sample".
- **Austria market calendar** (calendar icon in the AI Smart Radar header) is static frontend data in `frontend/src/lib/austriaCalendar.ts`, independent of the `events_calendar` table. Holidays, bridge days and shopping days are computed for any year; school terms, sports, festivals and concerts in `STATIC_ITEMS` cover only Sep 2026 - Sep 2027. Refresh that list once a year.
- The Keepa response shape was implemented from Keepa's official client sources and has not yet been checked against a live answer.
