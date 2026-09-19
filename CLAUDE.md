# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

Each service starts independently. Run from the workspace root:

```bash
# Backend API (port 8000)
cd backend && uv run uvicorn src.main:app --reload

# Frontend (port 3000)
cd frontend && npm run dev

# n8n automation (port 5678)
cd n8n && docker compose up -d

# Prometheus + Grafana monitoring (Grafana port 3002)
cd infrastructure/monitoring && docker compose up -d
```

## Build & lint

```bash
# Frontend
cd frontend && npm run build
cd frontend && npm run lint

# Backend has no lint/test commands configured
```

There are no automated tests in this project (pytest, jest, or otherwise).

## Environment setup

Two separate env files are required:

- `/.env` (workspace root) — loaded by the backend via `env_file="../.env"` in `backend/src/core/config.py`
- `/frontend/.env.local` — loaded by Next.js

Copy `.env.example` and fill in keys. `OPENAI_API_KEY`, `KEEPA_API_KEY`, and `PUSHOVER_*` are optional — every external service has a deterministic mock fallback when the key is absent.

`SUPABASE_ANON_KEY` in `.env.example` is **not** read by the backend `Settings` class — it only belongs in `frontend/.env.local`.

## Database migrations

```bash
supabase db push       # apply migrations to the linked remote project
supabase db reset      # reset local DB + apply migrations + run seed.sql
```

`seed.sql` only runs on `db reset`. To populate `events_calendar` on the hosted project, add a migration or insert rows manually.

**Never edit an already-applied migration.** Always create a new file: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`.

## Architecture

### Two UIs in one Next.js app

The app has two completely separate surfaces sharing the same Next.js instance:

| Surface | Routes | Auth |
|---|---|---|
| Public storefront | `/`, `/product/[id]`, `/impressum`, `/datenschutz` | None (anon) |
| Admin back office | `/admin/*` | Supabase auth + `is_admin()` RPC |

All pages use `'use client'` — there is no server-side rendering. Data is fetched entirely client-side.

### The write-path rule

**All mutations from the frontend go through the FastAPI backend** (which uses the Supabase service role key and bypasses RLS). The frontend's Supabase client uses the anon/authenticated role, which RLS limits to SELECT on most tables.

The single exception: invoice file upload in the admin dashboard writes directly to Supabase Storage and patches `opportunities.invoice_url` via the authenticated role.

When adding a new feature that writes data, add a backend endpoint — don't try to write directly from the frontend.

### Public data contract: `storefront_listings` view

The storefront reads exclusively from the `storefront_listings` view (defined across migrations in `supabase/migrations/`). This view:
- Filters to `status IN ('in_inventory', 'listed')` only
- Exposes only customer-safe columns (no buy price, margin, purchase thesis, etc.)
- Is readable by `anon` — no login required

Adding a column to `products` or `opportunities` does **not** expose it publicly. You must explicitly add it to the view in a new migration.

### Backend scan pipeline

`POST /api/v1/deals/scan` accepts an ASIN and immediately returns 202. The actual work runs as a background task:

```
Keepa API → DealAnalyzerAgent (gpt-4o-mini) → No-Buy guardrails
→ ListingGeneratorAgent (gpt-4o-mini) → persist to Supabase → Pushover notification
```

Business rules encoded in `backend/src/api/endpoints/deals.py`:
- Minimum profit thresholds: 25% margin AND €15 absolute profit to pass
- Hot deal push notification threshold: deal score ≥ 80
- Emergency sell price: 85% of target sell price

### Category list: must stay in sync

`backend/src/core/categories.py` (`CANONICAL_CATEGORIES`) and `frontend/src/lib/constants.ts` (`PRODUCT_CATEGORIES`) define the same list. **Both must be updated together** when adding or removing a category. There is no automated check.

### Authentication and admin access

- Admins sign in at `/admin/login` (email/password via Supabase Auth)
- Admin check: `is_admin()` SECURITY DEFINER function → queries `admin_users` table
- `admin_users` has RLS enabled with no policies → completely invisible to browser clients
- To provision a new admin: `INSERT INTO public.admin_users (user_id, email) SELECT id, email FROM auth.users WHERE email = '...'`
- There is no self-service signup; the `/admin/login` page rejects any authenticated account not in `admin_users`

### Supabase Realtime

The admin dashboard subscribes to `postgres_changes` on the `opportunities` table to auto-refresh after a background scan completes. If you add new tables that the admin should react to live, follow the same pattern in `frontend/src/app/admin/page.tsx`.

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

## Known mocks / incomplete features

- **BuyBox seller data** is randomly selected from 3 hardcoded sellers (`_pick_mock_buybox` in `deals.py`). All deal scores involving seller risk are based on fake data until live Keepa credits are active.
- **Price history chart** falls back to a deterministic sample curve when fewer than 2 real data points exist. The chart labels it "Sample".
- **n8n ASIN list** is hardcoded in `n8n/Vindera_Daily_Scan.json` — edit and re-import to change the watched ASINs.
- **`FASTAPI_SECRET_KEY`** in the config is not currently used anywhere.
