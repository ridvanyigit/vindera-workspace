# 🚀 Vindera - Cross-Border AI Arbitrage Engine

Vindera is a full-stack, AI-powered arbitrage platform designed to find highly profitable deals on Amazon (via Keepa API) and automatically generate localized, SEO-optimized listings for European second-hand marketplaces like Willhaben (Austria).

## 🏗️ Tech Stack
- **Frontend:** Next.js 14, TailwindCSS, Lucide Icons (Hosted on Vercel)
- **Backend:** Python, FastAPI, Pydantic, uv (Local / Docker)
- **Database:** Supabase (PostgreSQL)
- **AI Engine:** OpenAI (gpt-4o-mini)
- **Automation:** n8n (Docker)
- **Monitoring:** Prometheus & Grafana (Docker)

## 🧠 AI Agents Structure
1. **Deal Analyzer Agent:** Evaluates historical price drops vs. current prices and calculates potential profit margins.
2. **Listing Generator Agent:** Creates persuasive, market-specific (e.g., Austrian German) sales listings emphasizing the "New/OVP" condition of the items.

## 🚀 How to Run Locally (M1 Mac)
1. **Start Backend:** `cd backend && uv run uvicorn src.main:app --reload`
2. **Start Automation:** `cd n8n && docker compose up -d`
3. **Start Monitoring:** `cd infrastructure/monitoring && docker compose up -d`
4. **Start Frontend:** `cd frontend && npm run dev`

## 🔮 Future Roadmap
- [ ] Implement actual Keepa API / Rainforest API for live data fetching.
- [ ] Transition to a fully Agentic AI framework (LangChain/CrewAI).
- [ ] Migrate from local Docker to AWS EC2 / Kubernetes.