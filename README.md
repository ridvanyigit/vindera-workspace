# 🚀 Vindera — Cross-Border AI Arbitrage Engine

Vindera is a full-stack, AI-powered arbitrage platform that finds profitable deals on Amazon.de (via the Keepa API), scores them against a 10-criteria acquisition methodology, and generates localized, SEO-optimized listings for Willhaben (Austria).

📘 Full technical reference: [`TECH-DOKUMENTATION.md`](./TECH-DOKUMENTATION.md)

## 🏗️ Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TailwindCSS v4, Inter + JetBrains Mono, recharts
- **Backend:** Python 3.14, FastAPI, Pydantic, uv
- **Database & Auth:** Supabase (PostgreSQL, RLS, Storage)
- **AI Engine:** OpenAI `gpt-4o-mini` (structured outputs + function calling)
- **Automation:** n8n (Docker) — daily batch ASIN scan
- **Monitoring:** Prometheus & Grafana (Docker)

## 🖥️ Application Views

| Route | Purpose |
|---|---|
| `/` | Public storefront — anyone can browse in_inventory/listed items and wishlist them; no cart, "Buy" opens the live Willhaben ad |
| `/login` | Shared Supabase email/password sign-in + sign-up (customers and admin) |
| `/wishlist` | A signed-in customer's favorited items |
| `/admin` | Admin-only: three-pane workspace — deal explorer, deal inspector, analytics + AI terminal |
| `/admin/products` | Admin-only: Product Master — searchable, resizable table with CSV export |
| `/admin/manual-entry` | Admin-only: hand-enter or edit a complete opportunity |
| `/admin/reports` | Admin-only: tax & financial reports, VAT threshold tracking |

Admin access is granted via the `admin_users` table (checked by the `is_admin()` RPC), not just "being logged in" — see the `20260918084045_public_storefront_and_wishlists` migration.

## 🧠 AI Agents

1. **Deal Analyzer Agent** — scores discount, demand, competition, capital efficiency, storage, risk and seasonality; returns a 0-100 deal score, a holding period and a purchase thesis.
2. **Listing Generator Agent** — writes the German Willhaben listing and calculates the suggested price (midpoint between buy price and historical Amazon price).
3. **Chatbot Agent** — powers the workspace terminal via slash commands (`/list`, `/scan`, `/delete`, `/help`) and natural-language function calling.

## ⚙️ Setup

1. Copy `.env.example` to `.env` at the workspace root and fill in your keys.
2. Create `frontend/.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_API_URL`.
3. Apply the database migrations: `supabase db push`.

## 🚀 Run Locally (Apple Silicon)

```bash
cd backend && uv run uvicorn src.main:app --reload   # API      → :8000
cd n8n && docker compose up -d                       # n8n      → :5678
cd infrastructure/monitoring && docker compose up -d  # Grafana  → :3002
cd frontend && npm run dev                           # Frontend → :3000
```

## 🔮 Roadmap

- [ ] Live Keepa credits for real BuyBox ownership and daily price history.
- [ ] Migrate the agent chain to an agentic framework (LangGraph / CrewAI).
- [ ] Automated tests (pytest / jest) and a CI/CD pipeline.
- [ ] Move the Docker services to AWS with Terraform provisioning.
