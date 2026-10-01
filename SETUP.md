# Vindera — Full Local Setup Guide

This document takes a fresh machine with nothing installed to a fully running local copy of Vindera — frontend, backend, database, automation and monitoring — with no steps skipped and no surprises along the way. It is a **mechanical, zero-to-running guide**; for *why* the system is built this way, see [`TECH-DOKUMENTATION.md`](./TECH-DOKUMENTATION.md) (architecture, design decisions) and [`CLAUDE.md`](./CLAUDE.md) (contributor rules and conventions). Production deployment is a separate, already-documented runbook: [`docs/DEPLOY.md`](./docs/DEPLOY.md); this guide covers **local development only**, and calls out the one place where it touches production concerns (env-var validation).

> Written for macOS (the project is developed and tested on Apple Silicon). Linux steps are nearly identical — only the Homebrew install commands change. Windows is not covered; use WSL2 and follow the Linux path.

## Table of Contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [Prerequisites](#2-prerequisites)
3. [Get the code](#3-get-the-code)
4. [Environment variables](#4-environment-variables)
5. [Local Supabase (database + auth + storage)](#5-local-supabase-database--auth--storage)
6. [Backend (FastAPI)](#6-backend-fastapi)
7. [Frontend (Next.js)](#7-frontend-nextjs)
8. [Create your first admin account](#8-create-your-first-admin-account)
9. [Optional: n8n automation](#9-optional-n8n-automation)
10. [Optional: Prometheus + Grafana monitoring](#10-optional-prometheus--grafana-monitoring)
11. [Startup order, end to end](#11-startup-order-end-to-end)
12. [Verifying everything works](#12-verifying-everything-works)
13. [Running the test suite](#13-running-the-test-suite)
14. [Troubleshooting](#14-troubleshooting)
15. [Production deployment (pointer)](#15-production-deployment-pointer)
16. [Reference — official documentation](#16-reference--official-documentation)
17. [Appendix: LLMOps / AI Platform Engineering sandbox (optional)](#17-appendix-llmops--ai-platform-engineering-sandbox-optional)

---

## 1. Architecture at a glance

```mermaid
flowchart LR
    Browser(["Browser"])

    subgraph FE["Next.js Frontend — :3000"]
        Storefront["/ storefront\n(public, anon)"]
        Admin["/admin/*\n(Supabase-auth only)"]
    end

    subgraph BE["FastAPI Backend — :8000"]
        API["/api/v1/*"]
        Health["/healthz  /readyz\n(public)"]
        Metrics["/metrics\n(Bearer METRICS_TOKEN)"]
    end

    subgraph SB["Local Supabase (Docker) — supabase start"]
        PG[("Postgres\n:54322")]
        Auth["GoTrue Auth"]
        Storage["Storage API\n(private invoices bucket)"]
        Studio["Studio UI\n:54323"]
    end

    OpenAI[["OpenAI API"]]
    Keepa[["Keepa API"]]
    Pushover[["Pushover"]]
    Sentry[["Sentry (optional)"]]
    N8N["n8n — :5678\n(daily cron)"]
    Prom["Prometheus — :9090"]
    Graf["Grafana — :3002"]

    Browser --> Storefront
    Browser --> Admin
    Storefront -- "SELECT only, anon key" --> PG
    Admin -- "Supabase access token" --> Auth
    Admin -- "Bearer token" --> API
    API -- "service_role key\n(bypasses RLS)" --> PG
    API -- "service_role key" --> Storage
    API --> OpenAI
    API --> Keepa
    API --> Pushover
    API -. errors .-> Sentry
    N8N -- "X-Vindera-Key header" --> API
    Prom -- "scrapes, Bearer token" --> Metrics
    Graf -- "queries" --> Prom
    Graf -- "reads directly\n(read-only user)" --> PG
    Studio --> PG
```

**The one rule that matters most:** every mutation from the browser goes through the FastAPI backend (service role key, bypasses Row Level Security). The browser's own Supabase role can only `SELECT`, plus one narrow column-level `UPDATE` for invoice uploads. See CLAUDE.md → *"The write-path rule"* for the full explanation — this guide only needs you to know it so the env vars below make sense.

---

## 2. Prerequisites

Install these **in this order** — later tools (uv, the Supabase CLI) assume Docker and Git are already present.

| # | Tool | Version used in this repo | Install (macOS / Homebrew) | Verify | Docs |
|---|---|---|---|---|---|
| 1 | **Git** | 2.50+ | `brew install git` | `git --version` | [git-scm.com/doc](https://git-scm.com/doc) |
| 2 | **Docker Desktop** | 28.x | Download from [docker.com](https://www.docker.com/products/docker-desktop/) (Homebrew cask also works: `brew install --cask docker`) — **must be running** before any `supabase`/`docker compose` command | `docker --version` and `docker compose version` | [docs.docker.com/desktop](https://docs.docker.com/desktop/) |
| 3 | **Node.js** | 24.x (Next.js 16 requires Node ≥ 20) | `brew install node` (or `nvm install 24` if you use [nvm](https://github.com/nvm-sh/nvm)) | `node -v` / `npm -v` | [nodejs.org](https://nodejs.org/en/download) |
| 4 | **uv** (Python package/version manager) | 0.9+ | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | `uv --version` | [docs.astral.sh/uv](https://docs.astral.sh/uv/) |
| 5 | **Python 3.14** | exact version pinned by `backend/pyproject.toml` (`requires-python = ">=3.14"`) | **Not a separate install** — `uv` downloads and manages the matching interpreter automatically the first time you run `uv sync` inside `backend/` | `cd backend && uv run python --version` | [python.org](https://www.python.org/) |
| 6 | **Supabase CLI** | 2.117+ | `brew install supabase/tap/supabase` | `supabase --version` | [supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli) |
| 7 | **OpenSSL** | preinstalled on macOS | — | `openssl version` | used below only to generate two random secrets |

Optional, only needed for the sections marked *optional* further down: nothing else — n8n, Prometheus and Grafana all run as Docker containers, no local install needed.

---

## 3. Get the code

```bash
git clone <this repository's URL> vindera-workspace
cd vindera-workspace
```

The rest of this guide assumes your shell is at the **workspace root** (`vindera-workspace/`) unless a step says otherwise.

---

## 4. Environment variables

Two separate env files are required. Nothing is auto-created — you must copy both example files yourself.

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

### 4.1 Root `.env` (read by the backend)

Read via `env_file="../.env"` in `backend/src/core/config.py`. Every field below is defined in `Settings` in that file.

| Variable | Required in local dev? | Local dev value | Where to get it |
|---|---|---|---|
| `SUPABASE_URL` | **Yes** | `http://127.0.0.1:54321` | Printed by `supabase status` (§5) |
| `SUPABASE_ANON_KEY` | No — listed here for convenience only | *(not read by the backend)* | The backend's `Settings` class ignores this key entirely; it exists only so this one file can list every Supabase value in one place. The frontend reads its own copy from `frontend/.env.local` (§4.2). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | the `service_role key` from `supabase status` | Printed by `supabase status` (§5) — **never share this value**, it bypasses every RLS policy |
| `OPENAI_API_KEY` | No | leave blank to skip AI features, or set `ALLOW_MOCK_DATA=true` below | Create at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | No (default `gpt-4o-mini`) | `gpt-4o-mini` | — |
| `KEEPA_API_KEY` | No | leave blank to skip real price data, or use mock data | Subscribe at [keepa.com/#!api](https://keepa.com/#!api) |
| `PUSHOVER_USER_KEY` / `PUSHOVER_API_TOKEN` | No | leave blank to skip push notifications | Create an account and an application at [pushover.net](https://pushover.net/) → *user key* is on your dashboard, *API token* comes from [pushover.net/apps/build](https://pushover.net/apps/build) |
| `ENVIRONMENT` | **Yes** | `development` | Never set to `production` locally — the backend then refuses to start unless every production secret is present (see §15) |
| `CORS_ALLOWED_ORIGINS` | No (has a working default) | `http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001` | Already covers the frontend dev server and its fallback port |
| `AUTOMATION_SHARED_SECRET` | Only if you'll exercise n8n calls (§9) | generate one anyway | `openssl rand -hex 32` |
| `METRICS_TOKEN` | Only if you'll run the monitoring stack (§10) | leave blank to leave `/metrics` open locally, or generate one | `openssl rand -hex 32` |
| `SENTRY_DSN` | No | leave empty (disables Sentry) | [sentry.io](https://sentry.io/) project settings, if you want error tracking |
| `LOG_LEVEL` | No (default `INFO`) | `INFO` | one of `DEBUG` / `INFO` / `WARNING` / `ERROR` |
| `ALLOW_MOCK_DATA` | No (default `false`) | set `true` if you don't have Keepa/OpenAI keys yet — scans then return clearly-labelled `[MOCK]` data instead of failing | — |
| `RETURN_WINDOW_DAYS` | No (default `30`) | `30` | Amazon.de's return window, in days |
| `SELL_PRICE_POSITION` | No (default `0.5`) | `0.5` | where the suggested price sits between today's Amazon price (`0`) and the 90-day reference price (`1`) |

Generate both secrets in one go:

```bash
echo "AUTOMATION_SHARED_SECRET=$(openssl rand -hex 32)"
echo "METRICS_TOKEN=$(openssl rand -hex 32)"
# paste the two output lines into .env, replacing the placeholder values
```

### 4.2 `frontend/.env.local` (read by Next.js, public/build-time)

Every value here ships to the browser — never put a secret in this file.

| Variable | Required? | Local dev value | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | `http://127.0.0.1:54321` | same local API URL as `SUPABASE_URL` above |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | the `anon key` from `supabase status` | the "anon" / publishable key — **not** `service_role` |
| `NEXT_PUBLIC_API_URL` | **Yes** | `http://localhost:8000` | where the FastAPI backend listens |
| `NEXT_PUBLIC_SITE_URL` | **Yes** | `http://localhost:3000` | used for `robots.txt`, `sitemap.xml`, canonical links |

These four are read at **build time** — if you change one after `npm run build`, rebuild.

---

## 5. Local Supabase (database + auth + storage)

> **Safety rule, worth repeating from CLAUDE.md:** this local instance is completely separate from the hosted (production) Supabase project. Never run `supabase link` or `supabase db push` while following this guide — those touch the hosted project and are reserved for the project owner, after a backup.

1. Make sure **Docker Desktop is running** (Supabase's local stack is a set of Docker containers).
2. Start it:
   ```bash
   supabase start
   ```
   The first run downloads several Docker images (Postgres, GoTrue, PostgREST, Storage, Studio, …) — expect this to take a few minutes. Every later `supabase start` is fast.
3. Apply every migration and the seed data:
   ```bash
   supabase db reset --local
   ```
   This drops and recreates the local database, replays every file in `supabase/migrations/` in order, then runs `supabase/seed.sql`. Run this again any time you want a clean slate.
4. Read off the values you need for §4:
   ```bash
   supabase status
   ```
   Copy `API URL` → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, `anon key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`.

**Local ports** (from `supabase/config.toml`), all bound to `127.0.0.1`:

| Service | Port | URL |
|---|---|---|
| API (PostgREST / Auth / Storage / Realtime gateway) | `54321` | http://127.0.0.1:54321 |
| Postgres | `54322` | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Shadow DB (used by `db diff` only) | `54320` | — |
| Studio (web UI) | `54323` | http://127.0.0.1:54323 |
| Inbucket (catches every "sent" email — nothing leaves your machine) | `54324` | http://127.0.0.1:54324 |
| Analytics | `54327` | — |
| DB connection pooler | `54329` | disabled by default (`[db.pooler] enabled = false`) |

Open **Studio** (http://127.0.0.1:54323) now — you'll use it in §8 to create your first admin user, and it's generally the easiest way to browse tables while developing.

---

## 6. Backend (FastAPI)

```bash
cd backend
uv sync
```

`uv sync` reads `backend/pyproject.toml` + `backend/uv.lock`, downloads a matching Python 3.14 if you don't already have one, and creates `backend/.venv` with exactly the pinned dependency versions (`fastapi`, `pydantic`, `supabase`, `openai`, `sentry-sdk`, `slowapi`, etc.).

Run it:

```bash
uv run uvicorn src.main:app --reload --reload-dir src
```

> **Why `--reload-dir src` and not just `--reload`:** without it, uvicorn's file watcher scans the entire `backend/` tree — including `.venv`, which holds thousands of files. Any write in there (a background `uv` operation, a macOS Spotlight/security scan touching a file's metadata) can trigger a full, slow reload. Scoping the watcher to `src/` avoids that entirely; this is the exact command CLAUDE.md specifies.

The backend now listens on **http://localhost:8000**. Leave this terminal running; open a new tab/pane for the next steps.

`main.py` runs `assert_routes_protected` on startup — if this ever fails, it means a new `/api/v1` router was added without an auth dependency, and the app refuses to start on purpose. You should not see this locally unless you're editing route code.

---

## 7. Frontend (Next.js)

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** — you should see the public storefront (empty is expected: there's no inventory yet, since you haven't run a scan). If port 3000 is already taken, Next.js automatically falls back to 3001; `CORS_ALLOWED_ORIGINS` in `.env` already allows both, so nothing else needs to change.

---

## 8. Create your first admin account

There is **no self-service signup** — by design, per CLAUDE.md. Every admin has to be provisioned by hand, once:

1. Open **Supabase Studio** → http://127.0.0.1:54323 → **Authentication** → **Users** → **Add user** → **Create new user**. Give it a real email address and a password you'll remember (email confirmation is not required locally — Inbucket at http://127.0.0.1:54324 would catch the confirmation email anyway if it were).
2. Still in Studio, open **SQL Editor** and run, with your own email:
   ```sql
   INSERT INTO public.admin_users (user_id, email)
   SELECT id, email FROM auth.users WHERE email = 'you@example.com';
   ```
3. Go to **http://localhost:3000/admin/login** and sign in with that email/password.

`is_admin()` is a `SECURITY DEFINER` function that checks `admin_users`; the table itself has RLS enabled with **no policies**, so it's invisible to any browser query — the only way in is this SQL insert.

---

## 9. Optional: n8n automation

n8n runs the daily watchlist scan in production; running it locally is optional and only useful if you want to test that automation path end to end.

```bash
cd n8n
docker compose up -d
```

This starts n8n on **http://localhost:5678**, backed by a named Docker volume (`n8n_data`) so your workflow survives a container restart.

1. Open http://localhost:5678 — on first visit, n8n asks you to create its own local **owner account** (separate from Vindera's admin accounts; this one only protects the n8n UI itself).
2. **Workflows → Import from File** → select `n8n/Vindera_Daily_Scan.json`.
3. The workflow's two `HTTP Request` nodes need a credential. Go to **Credentials → New → Header Auth**, name it exactly **`Vindera Automation Key`**, set:
   - **Header Name:** `X-Vindera-Key`
   - **Header Value:** the same value you put in `AUTOMATION_SHARED_SECRET` in the root `.env` (§4.1)
4. Open the imported workflow and select that credential on both **"Trigger FastAPI Deal Scan"** and **"Trigger Dead Stock Check"** nodes (the secret is never stored in the workflow JSON itself, which is why this step is manual).
5. The workflow calls the backend at `VINDERA_API_BASE_URL`, which defaults to `http://host.docker.internal:8000` — Docker Desktop on macOS resolves this to your host machine automatically, so the default just works as long as the backend (§6) is running.
6. Leave the workflow **inactive** unless you specifically want the real `08:15` daily cron to fire against your local backend — use the **"Execute Workflow"** button in the editor to trigger a one-off test run instead.

---

## 10. Optional: Prometheus + Grafana monitoring

```bash
cd infrastructure/monitoring
cp .env.example .env
```

Edit that new `.env` file (it is git-ignored, separate from the root `.env`):

| Variable | Required? | Local dev value |
|---|---|---|
| `GRAFANA_ADMIN_PASSWORD` | **Yes — compose refuses to start without it** | pick any password |
| `VINDERA_DB_HOST` / `_PORT` / `_USER` / `_PASSWORD` | No (defaults match local Supabase) | `host.docker.internal` / `54322` / `postgres` / `postgres` |
| `PUSHOVER_API_TOKEN` / `PUSHOVER_USER_KEY` | **Yes — compose refuses to start without them, even if you don't use Pushover** | reuse the same values as the root `.env` (§4.1) if you have them, or any non-empty placeholder string |

> This last point is the one gotcha in this whole guide: `docker-compose.yml` uses `${VAR:?message}`, which makes Docker Compose hard-fail on startup if `GRAFANA_ADMIN_PASSWORD`, `PUSHOVER_API_TOKEN` or `PUSHOVER_USER_KEY` are unset or empty — even though Pushover itself is an optional feature everywhere else in this project.

Prometheus also expects a token file (kept out of git):

```bash
cp secrets/metrics_token.example secrets/metrics_token
```

If you left `METRICS_TOKEN` **unset** in the root `.env`, the backend leaves `/metrics` open locally and this file's placeholder content doesn't matter. If you *did* set `METRICS_TOKEN`, put that exact value (and nothing else) into `secrets/metrics_token`.

Start the stack:

```bash
docker compose up -d
```

| Service | URL | Login |
|---|---|---|
| Prometheus | http://127.0.0.1:9090 | none — check **Status → Targets**, `vindera_fastapi` should be `UP` |
| Grafana | http://127.0.0.1:3002 | `admin` / whatever you put in `GRAFANA_ADMIN_PASSWORD` |

Grafana comes pre-provisioned (from `grafana-provisioning/`, not just the Docker volume, so it survives a wiped container) with:
- a `vindera-postgres` data source, reading the local database directly,
- a `Prometheus` data source,
- three dashboards: **vindera-business**, **vindera-db-health**, **vindera-system-health**,
- two Pushover alert contact points, wired to the `PromptInjectionBlocked`-style rules in `infrastructure/monitoring/alerts.yml`.

Both UIs are bound to `127.0.0.1` on purpose — only this machine can open them, even on a shared network.

---

## 11. Startup order, end to end

Everything after Supabase can, in principle, start in any order (the backend degrades gracefully if a dependency isn't up yet — `/readyz` just reports `503` until Postgres is reachable) — but this is the order with the fewest moving parts to debug if something looks wrong the first time:

```mermaid
flowchart TD
    A["Docker Desktop running"] --> B["supabase start"]
    B --> C["supabase db reset --local"]
    C --> D["supabase status\n→ fill in .env and frontend/.env.local"]
    D --> E["cd backend && uv sync"]
    E --> F["uv run uvicorn src.main:app --reload --reload-dir src\n:8000"]
    D --> G["cd frontend && npm install"]
    G --> H["npm run dev\n:3000"]
    F --> I["Create first admin (§8)"]
    H --> I
    I --> J{"Want automation\nor monitoring?"}
    J -- n8n --> K["cd n8n && docker compose up -d\n:5678"]
    J -- monitoring --> L["cd infrastructure/monitoring\ncp .env.example .env && docker compose up -d\n:9090 / :3002"]
    J -- "no, just the app" --> M["Done — verify (§12)"]
    K --> M
    L --> M
```

Once running, you have up to five things alive at once:

| # | Process | How it was started | Port |
|---|---|---|---|
| 1 | Local Supabase (several containers) | `supabase start` | 54321-54329 |
| 2 | FastAPI backend | `uv run uvicorn …` (foreground terminal) | 8000 |
| 3 | Next.js frontend | `npm run dev` (foreground terminal) | 3000 |
| 4 | n8n *(optional)* | `docker compose up -d` in `n8n/` | 5678 |
| 5 | Prometheus + Grafana *(optional)* | `docker compose up -d` in `infrastructure/monitoring/` | 9090, 3002 |

Stopping: `Ctrl+C` the two foreground terminals (backend, frontend); `docker compose down` in `n8n/` and/or `infrastructure/monitoring/` (add `-v` only if you also want to wipe their volumes); `supabase stop` for the database stack (add `--no-backup` only if you explicitly want to discard the local DB — plain `supabase stop` preserves it for next time).

---

## 12. Verifying everything works

```bash
curl -s http://localhost:8000/healthz   # → {"status":"ok"} — the process is alive
curl -s http://localhost:8000/readyz    # → 200 once Postgres is reachable, 503 otherwise
```

Then, with the backend running:

```bash
cd backend
BASE_URL=http://localhost:8000 ./scripts/smoke_auth.sh
```

This exercises the whole authorization matrix in one pass — every `/api/v1/*` route should be `401` with no credentials, `/healthz`/`/readyz` should be public `200`s, and `/metrics` should match whatever you chose for `METRICS_TOKEN`. Pass `ADMIN_TOKEN=<a real Supabase access token>` (copy it from your browser's dev tools → Application → Local Storage, after signing in at `/admin/login`), `AUTOMATION_KEY=<your AUTOMATION_SHARED_SECRET>` and/or `METRICS_TOKEN=<your METRICS_TOKEN>` as environment variables to also check the authenticated paths — the script's own header comment documents exactly what each one unlocks. `PASS`/`FAIL` lines print for every check; it exits non-zero if anything failed.

Manual checklist:

- [ ] http://localhost:3000 loads the public storefront (empty inventory is expected on a fresh database)
- [ ] http://localhost:3000/admin/login lets you sign in with the account from §8
- [ ] http://localhost:3000/admin shows the three-pane admin workspace
- [ ] http://127.0.0.1:54323 (Studio) shows all the tables from `supabase/migrations/`
- [ ] *(if §9 done)* http://localhost:5678 shows the imported `Vindera Daily Auto-Scan` workflow
- [ ] *(if §10 done)* http://127.0.0.1:9090/targets shows `vindera_fastapi` as `UP`; http://127.0.0.1:3002 shows the three provisioned dashboards

---

## 13. Running the test suite

```bash
# Backend — fast, no network, no real Supabase/Keepa/OpenAI/Pushover
cd backend
uv run pytest -q
```

`backend/tests/conftest.py` sets its own environment, imports the app fresh, and swaps every Supabase client for an in-memory fake — no running Supabase instance is needed for this command.

```bash
# Frontend
cd frontend
npx tsc --noEmit && npm run lint && npm test && npm run build
```

`npm run build` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_API_URL` to be set (your `frontend/.env.local` from §4.2 already covers this; dummy values are fine too, e.g. in CI).

```bash
# SQL checks — needs local Supabase running, freshly reset
supabase db reset --local
docker exec -i supabase_db_vindera-workspace psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/phase2_smoke.sql
docker exec -i supabase_db_vindera-workspace psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/report_summary_smoke.sql
```

(`supabase_db_vindera-workspace` is the Postgres container name Supabase derives from `project_id = "vindera-workspace"` in `supabase/config.toml`.)

All three of the above are exactly what `.github/workflows/ci.yml` runs on every push — none of them need a single secret.

---

## 14. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `supabase start` hangs or errors immediately | Docker Desktop isn't running | Start Docker Desktop, wait for it to say "running", retry |
| Monitoring's `docker compose up -d` fails with `variable is not set` | `GRAFANA_ADMIN_PASSWORD`, `PUSHOVER_API_TOKEN` or `PUSHOVER_USER_KEY` missing/empty in `infrastructure/monitoring/.env` | Fill in all three, even with a placeholder for the two Pushover ones (§10) |
| Backend refuses to start with a list of "Unsafe production configuration" errors | `ENVIRONMENT=production` was set locally | Set `ENVIRONMENT=development` in the root `.env` |
| `/admin/login` accepts your password but you're bounced back to the login page | You signed up in Studio but skipped the `admin_users` INSERT | Run the SQL in §8, step 2 |
| n8n's scan calls return `401` | The `Vindera Automation Key` credential's header value doesn't match `AUTOMATION_SHARED_SECRET` | Re-check §9 step 3 — the value has to match the root `.env` exactly |
| `/metrics` returns `401` when you expect `200` (or vice-versa) | `METRICS_TOKEN` is set on the backend but the request has no/the wrong `Authorization: Bearer` header | Either unset `METRICS_TOKEN` for local dev, or always pass the matching header — see the comment in `infrastructure/monitoring/prometheus.yml` |
| Backend keeps reloading on its own for no code change | Ran `uvicorn` without `--reload-dir src`, so the watcher is also watching `.venv` | Always use the exact command in §6 |
| Every scan ends as a `failed` job, never a deal | `OPENAI_API_KEY` and/or `KEEPA_API_KEY` are unset — this is by design, not a bug | Either add real keys, or set `ALLOW_MOCK_DATA=true` to get clearly-labelled `[MOCK]` data instead |
| Port `3000` is already taken by something else | Another dev server, or a previous `npm run dev` still running | Next.js auto-falls-back to `3001` — `CORS_ALLOWED_ORIGINS` already allows it, no config change needed |
| `git status`/CI touches the hosted Supabase project by accident | `supabase link` or `supabase db push` was run locally | Never run those in local dev — only the project owner runs `db push`, after a backup (`docs/MANUEL-ADIMLAR.md`) |

---

## 15. Production deployment (pointer)

Production is a different topology entirely — one EU VPS running the backend, n8n and monitoring under Docker Compose behind Caddy, the frontend on Vercel, and the database on **hosted** Supabase (`infrastructure/prod/`). It has its own fully detailed, already-written runbook:

📘 **[`docs/DEPLOY.md`](./docs/DEPLOY.md)**

The one thing worth knowing *before* you open that document: the same `Settings` class this guide configured for local dev (`backend/src/core/config.py`) actively **refuses to start** when `ENVIRONMENT=production` unless `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTOMATION_SHARED_SECRET` and `METRICS_TOKEN` (32+ characters each) are all set, `CORS_ALLOWED_ORIGINS` contains no `localhost`/`127.0.0.1` entry, and `ALLOW_MOCK_DATA` is `false` — this is intentional, and `docs/DEPLOY.md` walks through satisfying every one of those.

---

## 16. Reference — official documentation

| Technology | Docs |
|---|---|
| Next.js | [nextjs.org/docs](https://nextjs.org/docs) |
| React | [react.dev](https://react.dev/) |
| Tailwind CSS v4 | [tailwindcss.com/docs](https://tailwindcss.com/docs) |
| FastAPI | [fastapi.tiangolo.com](https://fastapi.tiangolo.com/) |
| Pydantic / Pydantic Settings | [docs.pydantic.dev](https://docs.pydantic.dev/latest/) |
| uv | [docs.astral.sh/uv](https://docs.astral.sh/uv/) |
| Supabase (CLI + local development) | [supabase.com/docs/guides/local-development](https://supabase.com/docs/guides/local-development) |
| OpenAI API | [platform.openai.com/docs](https://platform.openai.com/docs) |
| Keepa API | [keepa.com/#!api](https://keepa.com/#!api) |
| Pushover API | [pushover.net/api](https://pushover.net/api) |
| n8n | [docs.n8n.io](https://docs.n8n.io/) |
| Prometheus | [prometheus.io/docs](https://prometheus.io/docs/introduction/overview/) |
| Grafana | [grafana.com/docs](https://grafana.com/docs/) |
| Docker / Docker Compose | [docs.docker.com](https://docs.docker.com/) |
| Sentry | [docs.sentry.io](https://docs.sentry.io/) |

---

## 17. Appendix: LLMOps / AI Platform Engineering sandbox (optional)

None of what follows is required to run Vindera — §1 through §16 above are the complete, self-sufficient guide to the real, running application. This appendix exists for one reason: an 11-module, hands-on LLMOps curriculum was built directly on top of this codebase, one tool at a time, each wired into a real (if experimental/sandboxed) part of Vindera and verified with real commands, originally on a separate branch (`learn/llmops`) that was later folded back into `main` as a structure-only, non-installed snapshot (see the `v3.0.0` entry in `TECH-DOKUMENTATION.md` §15/§17).

So: every file path below does exist in this repository as of `v3.0.0`, but none of the packages, containers, clusters or models they depend on are installed. What follows is the exact, reproducible recipe for each module — install commands, real wiring, the actual commands used to run and verify it, and the one real gotcha each module surfaced — condensed from the full teaching write-up. That full write-up (concept dictionaries, dashboard tours, every mistake made and fixed, in the original language it was taught in) lives in this repo at `docs/llmops-mufredat.md` and, as the durable original, at the Claude Docs artifact it was authored in:

📘 **[LLMOps curriculum — full write-up (Claude Docs artifact)](https://claude.ai/code/artifact/82c93842-c385-4045-b7b5-9d1ad351af75)**

| # | Module | Tool(s) | One-line purpose |
|---|---|---|---|
| 1 | LLM Observability | Langfuse | See exactly what an LLM call cost, in tokens/€/latency, and why it answered the way it did |
| 2 | LLM Evaluation | DeepEval (chosen over Promptfoo / Ragas) | Turn "is the AI output good?" into an automated, repeatable check |
| 3 | Vector Database | pgvector | Find semantically similar products/deals, not just keyword matches |
| 4 | LLM Gateway | LiteLLM | One API surface in front of multiple model providers, with automatic fallback |
| 5 | Experiment Tracking | MLflow | Compare prompt/model variants side by side instead of by memory |
| 6 | Guardrails & PII | Presidio (chosen over NeMo Guardrails) | Catch prompt injection in, and PII leaks out, without an extra paid LLM call |
| 7 | Infrastructure as Code | Terraform | Define the production server as code, plan-only (never applied) |
| 8 | Kubernetes | minikube + Helm | Run the backend in a self-healing, liveness/readiness-aware sandbox cluster |
| 9 | Model Serving | Ollama (vLLM evaluated, not used on Apple Silicon) | Run a free, local model as a non-authoritative "second opinion" |
| 10 | Pipeline Orchestration | Apache Airflow | Compare a code-first scheduler against n8n's visual one, same job |
| 11 | Capstone | OpenTelemetry (concept only — nothing installed) | How the pieces above would combine into one correlated observability story |

### A. Module 1 — Langfuse (LLM observability)

**Docs:** [langfuse.com/docs](https://langfuse.com/docs)

```bash
cd backend && uv add langfuse
```

Create a free project at [cloud.langfuse.com](https://cloud.langfuse.com) → **Settings → API Keys**, then add to the root `.env`: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` (default `https://cloud.langfuse.com`).

**Wiring:** a new `backend/src/core/observability.py` with `init_langfuse()` — if both keys are set, it bridges them into `os.environ` and then `import langfuse.openai`, which monkey-patches the OpenAI SDK's completion methods. Call `init_langfuse()` in `main.py` immediately after `init_sentry()`, **before** any agent module is imported — no changes needed in the agent files themselves.

**Gotcha:** Vindera never calls `load_dotenv()` — Pydantic `Settings` reads the `.env` file into itself but does not mirror it into the real `os.environ`, and the Langfuse SDK reads its keys from `os.environ` directly. Skip the explicit bridge and you get a silent "everything looks configured but no traces ever appear" failure.

**Verify:** trigger any agent call, then check **Traces** in your Langfuse project.

### B. Module 2 — DeepEval + Confident AI (LLM evaluation)

**Docs:** [deepeval.com/docs/getting-started](https://deepeval.com/docs/getting-started) — also evaluated: [promptfoo.dev](https://www.promptfoo.dev/docs/intro/), [Ragas](https://docs.ragas.io/)

```bash
cd backend && uv add --group dev deepeval
```

Recreate `backend/evals/` (deliberately **outside** `backend/tests/`, since `tests/conftest.py` blocks every outgoing socket by design and these evals make real, billed OpenAI calls): `fixtures.py` (sample product scenarios), `metrics.py` (three zero-cost, deterministic `BaseMetric` subclasses — `ListingStructureMetric`, `ForbiddenTopicsMetric`, `VerbatimAppendMetric` — no LLM-judge, no extra cost), `check_listing_generator.py` (console runner).

```bash
cd backend && PYTHONPATH=. .venv/bin/python evals/check_listing_generator.py
```

Optional cloud reporting:

```bash
cd backend && uv run deepeval login
cd backend && PYTHONPATH=. .venv/bin/python evals/report_to_confident_ai.py
```

**Gotcha:** the "official" path (`pytest.mark.asyncio` + `assert_test()`, run via `deepeval test run`) collides with the async OpenAI client on Python 3.14 (`NoEventLoopError`). Use the synchronous `evaluate()` API instead, making your own OpenAI calls with plain `asyncio.run()` first and handing DeepEval only the finished results.

### C. Module 3 — pgvector (vector database)

**Docs:** [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector) · [Supabase pgvector guide](https://supabase.com/docs/guides/database/extensions/pgvector)

New, timestamped migration (`supabase/migrations/<timestamp>_add_product_embeddings.sql`): `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;`, a `products.embedding vector(1536)` column, an HNSW cosine index, and a `match_similar_products(p_product_id, match_count)` RPC granted to `service_role` only — same pattern as every other atomic RPC in this repo.

```bash
supabase db reset --local
```

Recreate `backend/scripts/backfill_product_embeddings.py` (real `text-embedding-3-small` calls) — make it **refuse to run unless `SUPABASE_URL` is local**, learned the hard way in Module 1 (below).

```bash
cd backend && SUPABASE_URL="http://127.0.0.1:54321" SUPABASE_SERVICE_ROLE_KEY="<local service role key>" \
  PYTHONPATH=. .venv/bin/python scripts/backfill_product_embeddings.py
```

Verify with a real similarity query:

```sql
SELECT m.title, m.category, round(m.similarity::numeric, 4) AS similarity
FROM public.products p,
     LATERAL public.match_similar_products(p.id, 5) m
WHERE p.title LIKE '<some existing product title>%';
```

**Gotcha:** `SUPABASE_URL` in `backend/.env` pointing at the **hosted** project instead of `127.0.0.1:54321` is a real, easy-to-miss mistake with real consequences (a stray scan can hit production) — always confirm it before running anything that writes. If Supabase's own REST/Storage/Studio containers seem unreachable right after `supabase start`, run `supabase stop` then `supabase start` again — occasionally not every container comes up on the first try.

### D. Module 4 — LiteLLM (LLM gateway)

**Docs:** [docs.litellm.ai](https://docs.litellm.ai/docs/)

Recreate `litellm/docker-compose.yml` + `litellm/config.yaml` (proxy mode — an OpenAI-compatible server, not the embedded SDK mode), one `gpt-4o-mini` deployment using your real `OPENAI_API_KEY`.

```bash
cd litellm && docker compose up -d
curl http://localhost:4000/health/readiness
curl http://localhost:4000/v1/models
```

Point the backend at it by adding `OPENAI_BASE_URL=http://localhost:4000/v1` to the root `.env` (a new optional `Settings` field, passed as `base_url=` into both agents' `AsyncOpenAI(...)` calls — one line each, no other code changes).

**Optional Admin UI:** add a `db` Postgres service plus `DATABASE_URL`/`LITELLM_MASTER_KEY`/`UI_USERNAME`/`UI_PASSWORD` to the compose file, then open http://localhost:4000/ui for the Virtual Keys / Playground / Request Logs screens.

**Gotcha:** `docker run --env-file ../.env` does **not** strip surrounding quotes the way `docker compose`'s `env_file:` does — a value like `OPENAI_API_KEY="sk-proj-..."` gets passed to the container quotes and all, and OpenAI rejects it as malformed. Use `docker compose`, not `docker run --env-file`, against any `.env` file in this repo.

### E. Module 5 — MLflow (experiment tracking)

**Docs:** [mlflow.org/docs/latest](https://mlflow.org/docs/latest/index.html)

```bash
cd backend && uv add --group dev mlflow
```

Use `sqlite:///mlflow.db` as the tracking URI — the plain `file:./mlruns` store is deprecated/maintenance-mode in current MLflow. Recreate `backend/evals/compare_prompts_mlflow.py` (logs params + metrics for two prompt variants).

```bash
cd backend && PYTHONPATH=. .venv/bin/python evals/compare_prompts_mlflow.py
cd backend && .venv/bin/mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5001
# then open http://127.0.0.1:5001
```

Add to `.gitignore`: `backend/mlruns/`, `backend/mlartifacts/`, `backend/mlflow.db`.

**Gotcha:** the MLflow UI's cold start imports `pandas`/`protobuf`, which can take a very long time under disk I/O contention (e.g. macOS Spotlight/Time Machine running at the same time) — this is environmental, not a bug; give it time rather than assuming it hung.

### F. Module 6 — Presidio + a custom injection guard (guardrails & PII)

**Docs:** [microsoft.github.io/presidio](https://microsoft.github.io/presidio/) · [NeMo Guardrails](https://docs.nvidia.com/nemo/guardrails/latest/index.html) (evaluated, not used — see gotcha)

```bash
cd backend && uv add presidio-analyzer
cd backend && uv run python -m spacy download de_core_news_sm
```

Recreate `backend/src/core/pii_guard.py` (`find_pii(text) -> list[str]`, wrapping Presidio's `AnalyzerEngine` with the German spaCy model) and `backend/src/core/injection_guard.py` (`looks_like_prompt_injection(text) -> bool`, plain English/German regex patterns — no LLM call). Wire the injection check into `scan_pipeline.py` right after the Keepa fetch (input guardrail, fails the scan job cleanly on a hit), and add a `NoPIIMetric` to the Module 2 eval suite (output guardrail). Add a Prometheus counter (`vindera_prompt_injection_blocked_total`) and an alert rule in `infrastructure/monitoring/alerts.yml`.

**Gotchas:** (1) exclude Presidio's `PERSON` entity for German text — the small `de_core_news_sm` model flagged the ordinary adjective "Tolle" as a person's name at 85% confidence, purely because it was capitalized; keep only the pattern-based entities (`EMAIL_ADDRESS`, `PHONE_NUMBER`, `IBAN_CODE`, `CREDIT_CARD`). (2) NeMo Guardrails' Colang self-check flows were deliberately not used — they typically cost an extra LLM call per scan, which conflicts with this project's cost-conscious model policy; plain deterministic regex was chosen instead, the same trade-off as Module 2's metrics.

### G. Module 7 — Terraform (plan-only, no real cloud resources)

**Docs:** [developer.hashicorp.com/terraform](https://developer.hashicorp.com/terraform/docs)

Recreate `infrastructure/terraform/{main.tf,variables.tf,outputs.tf,terraform.tfvars.example}` matching `docs/DEPLOY.md`'s real production spec (Hetzner CX22, Falkenstein, Ubuntu 24.04, one SSH key resource, one firewall resource, one server resource).

```bash
cd infrastructure/terraform && terraform init
terraform validate
terraform fmt -recursive -diff
TF_VAR_hcloud_token="dummy-token-for-demo" TF_VAR_ssh_public_key="ssh-ed25519 AAAA...demo" terraform plan
```

Every command above is safe — no real credentials, no real infrastructure is created, read, or touched. `.terraform.lock.hcl` is meant to be committed (it pins provider versions); `.terraform/`, `*.tfstate*` and a real `terraform.tfvars` are not. **Never run `terraform apply`** against real credentials without the infrastructure owner's explicit, in-the-moment approval.

### H. Module 8 — Kubernetes sandbox (minikube + Helm)

**Docs:** [kubernetes.io/docs](https://kubernetes.io/docs/home/) · [helm.sh/docs](https://helm.sh/docs/)

```bash
brew install minikube helm
```

Recreate a Helm chart at `infrastructure/k8s-sandbox/vindera-backend/` (`Chart.yaml`, `values.yaml` with **placeholder** Supabase values, `templates/` for a Deployment, Service, ConfigMap and Secret — `replicaCount: 2`, `livenessProbe` → `/healthz`, `readinessProbe` → `/readyz`, and a `startupProbe`, see the gotcha below).

```bash
minikube start --driver=docker
docker build -t vindera-backend:sandbox backend        # on the HOST Docker daemon, not inside minikube
minikube image load vindera-backend:sandbox
kubectl create namespace vindera-sandbox
helm install vindera infrastructure/k8s-sandbox/vindera-backend -n vindera-sandbox
```

**Verify:** `kubectl get pods -n vindera-sandbox`; `kubectl port-forward` a pod and `curl` `/healthz` and `/readyz` directly (expect a real `200` and a real `503`, since the sandbox's fake Supabase URL is deliberately unreachable — that's the point: a pod can be alive but correctly kept out of traffic); `kubectl delete pod <name>` and watch the Deployment replace it automatically.

**Gotchas:** (1) building the image **inside** minikube's own Docker daemon (`eval $(minikube docker-env)`) can starve its limited VM memory mid-build on a constrained host (a real `Bytecode timed out` failure was hit this way) — build on the host daemon instead and ship the image in with `minikube image load`. (2) without a `startupProbe`, a slow cold import chain (in this project's case, the `openai` SDK's own hundreds of type definitions) can make `livenessProbe` kill and restart an otherwise perfectly healthy, just-slow-to-boot pod — always add one for any Python app with a nontrivial import chain.

**Clean up:** `helm uninstall vindera -n vindera-sandbox && kubectl delete namespace vindera-sandbox`, then `minikube delete` to remove the whole local cluster/VM.

### I. Module 9 — Ollama (model serving, "second opinion")

**Docs:** [ollama.com/docs](https://ollama.com/docs) — [vLLM](https://docs.vllm.ai/) and [TGI](https://huggingface.co/docs/text-generation-inference) were evaluated first; vLLM's own docs say it's source-build-only and officially "experimental" on Apple Silicon, so Ollama was used instead (same OpenAI-compatible serving idea, native Apple Silicon support).

```bash
brew install ollama
ollama pull gemma3:1b
```

New backend settings: `ENABLE_SECOND_OPINION_MODEL=false` (default — off), `SECOND_OPINION_BASE_URL=http://localhost:11434/v1`, `SECOND_OPINION_MODEL=gemma3:1b`. Recreate `backend/src/agents/second_opinion.py` — reuses `DealAnalyzerAgent`'s exact system prompt and output schema against Ollama's OpenAI-compatible endpoint; returns `None` on any error or while disabled, **never raises**. Wire it into `scan_pipeline.py` right after the real `deal_analyzer.analyze_deal()` call — its result is only logged, never persisted, and never allowed to change the saved deal.

**Verify:** set `ENABLE_SECOND_OPINION_MODEL=true`, run a scan, confirm the log shows a second-opinion score while the persisted deal's own score is unaffected. `.parse()`'s strict JSON-schema mode does work against Ollama's compatibility layer — worth confirming with a real call rather than assuming.

**Clean up:** `ollama rm gemma3:1b`, `brew uninstall ollama`, remove `/Applications/Ollama.app` if the desktop app was also installed, `rm -rf ~/.ollama`.

### J. Module 10 — Apache Airflow (pipeline orchestration, comparative)

**Docs:** [airflow.apache.org/docs](https://airflow.apache.org/docs/)

Recreate `infrastructure/airflow/docker-compose.yml` — a single `apache/airflow:3.0.3` container running `command: standalone` (SQLite + LocalExecutor) is enough for this; the official multi-container compose (webserver + scheduler + triggerer + worker + Postgres + Redis) asks for 4GB+ RAM on its own. Recreate `infrastructure/airflow/dags/vindera_daily_scan.py` with the TaskFlow API (`@dag`/`@task`), mirroring `n8n/Vindera_Daily_Scan.json`'s exact retry behavior (3 retries / 5s, only on the watchlist fetch — nothing else retries, matching n8n's own configuration exactly) and using `.expand()` for one mapped task per ASIN.

```bash
cd infrastructure/airflow && docker compose up -d
# UI at http://localhost:8081 — admin password is printed in the container's own logs
```

```bash
docker exec vindera_airflow airflow dags list-import-errors   # → "No data found"
docker exec vindera_airflow airflow dags test vindera_daily_scan 2026-01-01
```

**Gotcha:** never call `Variable.get(...)` at true module top level in a DAG file. Airflow 3's Task SDK turns that into a real network round-trip on **every** parse cycle, and if it fails, the DAG silently registers **zero** DAGs (not an error you'll see immediately). Only call `Variable.get(...)` from inside a plain function, invoked from within an `@task` body — this is also Airflow's own documented best practice, not just a workaround.

**Clean up:** `docker compose down -v` in `infrastructure/airflow/`.

### K. Module 11 — OpenTelemetry / integrated observability (concept only)

**Docs:** [opentelemetry.io/docs](https://opentelemetry.io/docs/) · [grafana.com/docs](https://grafana.com/docs/)

This module was deliberately kept conceptual — no package was ever installed for it. A real integration would add `opentelemetry-instrumentation-fastapi` for automatic spans, correlate each request's existing `request_id` (already in every JSON log line, see `core/logging_config.py`) with its OTel trace ID, and combine that with the Prometheus metrics and Grafana dashboards this project already runs permanently (§10 above) into one "LLM Health" panel — then prove it end to end by deliberately triggering a failure (e.g. an invalid `OPENAI_API_KEY`) and following the same `request_id` through the log line, the `vindera_openai_errors_total` metric, and (if configured) the Sentry event it produces.
