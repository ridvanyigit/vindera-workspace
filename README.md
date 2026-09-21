# 🚀 Vindera — Cross-Border AI Arbitrage Engine

Vindera is a full-stack, AI-assisted arbitrage tool for one Austrian small business: it finds profitable deals on Amazon.de (via the Keepa API), computes the real net profit from the owner's own fee and shipping numbers, drafts German listings for Willhaben, and tracks every unit from scan to sale or return (ledger, reports, VAT-threshold bar).

📘 Full technical reference: [`TECH-DOKUMENTATION.md`](./TECH-DOKUMENTATION.md)

## 🏗️ Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TailwindCSS v4, Inter + JetBrains Mono, recharts
- **Backend:** Python 3.14, FastAPI, Pydantic, uv
- **Database & Auth:** Supabase (PostgreSQL, RLS, Storage, atomic SQL functions)
- **AI Engine:** OpenAI `gpt-4o-mini` (structured outputs + function calling)
- **Automation:** n8n (Docker) — daily watchlist scan and inventory alerts
- **Monitoring:** Prometheus & Grafana (Docker), optional Sentry
- **Tests / CI:** pytest, Vitest, SQL smoke tests, GitHub Actions (no secrets needed)

## 🖥️ Application Views

| Route | Purpose |
|---|---|
| `/` | Public storefront — anyone can browse in_inventory/listed items, no account, no cart; "Buy" opens the live Willhaben ad |
| `/impressum` / `/datenschutz` | Legal notice and privacy policy |
| `/admin` | Admin-only: three-pane workspace — deal explorer, deal inspector, analytics + AI terminal |
| `/admin/products` | Admin-only: Product Master — searchable, resizable table with CSV export |
| `/admin/manual-entry` | Admin-only: hand-enter or edit a complete opportunity |
| `/admin/reports` | Admin-only: yearly reports from the sales ledger, VAT threshold tracking, CSV export |
| `/admin/login` | Separate, unlinked admin sign-in |

There is no customer account system — nothing is purchasable on Vindera itself, so an account would have nothing to do. Admin access is granted via the `admin_users` table (checked by the `is_admin()` RPC), not just "being logged in".

## 🧠 AI Agents

Money is never calculated by the AI: all profit figures come from one Decimal-based engine (`backend/src/services/profit_calculator.py`) using the owner's `business_settings`.

1. **Deal Analyzer Agent** — qualitative scores (demand, competition, risk, seasonality ...) and a purchase thesis; the 0-100 deal score is computed in code.
2. **Listing Generator Agent** — writes the German Willhaben copy; the payment line and legal footer are appended verbatim from the settings.
3. **Chatbot Agent** — admin-only workspace terminal (`/list`, `/scan`, `/help`, natural language). It cannot delete anything.

## ⚙️ Setup

1. Copy `.env.example` to `.env` at the workspace root and fill in your keys.
2. Copy `frontend/.env.example` to `frontend/.env.local` and fill in the public values (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`).
3. Local database: `supabase start`, then `supabase db reset --local`. (The hosted project is migrated only by the owner after a backup: `docs/MANUEL-ADIMLAR.md`.)
4. Create an admin: sign up a user in the local Supabase Studio, then `INSERT INTO public.admin_users (user_id, email) SELECT id, email FROM auth.users WHERE email = '...'`. There is no self-service signup.

## 🚀 Run Locally (Apple Silicon)

```bash
cd backend && uv run uvicorn src.main:app --reload   # API      → :8000
cd n8n && docker compose up -d                       # n8n      → :5678
cd infrastructure/monitoring && docker compose up -d  # Grafana  → :3002
cd frontend && npm run dev                           # Frontend → :3000
```

## ✅ Tests

```bash
cd backend && uv run pytest -q                                   # no network, no real services
cd frontend && npx tsc --noEmit && npm run lint && npm test && npm run build
```

## 🚢 Deployment

Production runs the backend, n8n and monitoring on one EU VPS with Docker Compose and Caddy (`infrastructure/prod/`), the frontend on Vercel and the database on hosted Supabase. Step by step: [`docs/DEPLOY.md`](./docs/DEPLOY.md).

Vercel: set the Root Directory to `frontend` and add the four public variables from `frontend/.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` = `https://api.<domain>`, `NEXT_PUBLIC_SITE_URL` = `https://www.<domain>`). They are read at build time, so redeploy after changing one. Never put the service-role key or any other secret in a `NEXT_PUBLIC_*` variable.

## 🔮 Roadmap

- [ ] Live Keepa credits for real BuyBox ownership and daily price history.
- [ ] Migrate the agent chain to an agentic framework (LangGraph / CrewAI).
- [x] Automated tests and CI (backend, frontend, database, deployment files).
- [ ] Move the Docker services to AWS with Terraform provisioning.
