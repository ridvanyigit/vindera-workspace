# VINDERA — FINAL VERIFICATION PLAN (test only, no code changes)

> Work order for Claude Code. The owner points Claude Code at this file.
> Read the WHOLE file first. Goal: prove that everything built so far (release v2.7.1, launch hardening phases 0-9) works,
> and write ONE report: `docs/TEST-REPORT.md`.

## 0. Rules (hard)

1. **This is a test run, not a change run.** Do NOT modify any tracked file (code, migrations, docs, config). If a test fails, do NOT fix it: record it in the report with reproduction steps, evidence and a severity (Blocker / Major / Minor). If a test needs a temporary change, do it in a scratch copy outside the repo (use the scratchpad directory).
2. The only file you may create in the repo is `docs/TEST-REPORT.md` (and, if you want, `docs/test-evidence/` for small text outputs; no screenshots larger than needed, no secrets). Do NOT commit or push anything. At the very end, `git status --short` must show only those new files; put that output in the report.
3. **Local only, no real services.** Use the LOCAL Supabase (`supabase start`, `--local`). Never use `--linked`, `db push`, or any command that writes to the hosted project. Never read, print or modify `/.env`, `frontend/.env.local` or any secret. Give every setting inline on the command line (local Supabase URL/keys, `ENVIRONMENT`, dummy secrets of 32+ characters). Keepa, OpenAI and Pushover must never be called for real: leave their keys empty or point them at local stub servers you start yourself. Prove it (no outgoing request to those hosts) in the report.
4. **One exception, read-only, on the public Vercel site** (section 8 only): plain `GET` requests without any login, no writes, no tokens other than the public anon key that the site itself ships to every visitor.
5. Do not touch the owner's running dev servers (ports 3000 and 8000 may be in use): use other ports (e.g. backend 8100, frontend 3100) and build in a scratch copy of `frontend/` so `.next` is not shared. Stop every server and container you start; leave local Supabase stopped at the end.
6. The machine has slow first-time file reads (dependency directories can take minutes on first use). Run long commands in the background and poll their output; give generous timeouts; warm caches once if needed. A slow start is not a failure; a timeout without evidence is "not verified", never "passed".
7. **Never write "passed" without evidence.** Every result in the report needs the command/action and the observed output (short). Anything you could not run is listed under "Not tested" with the reason. Do not pad the report.
8. Token discipline: run each suite once (plus once after an environment problem), print only `| tail -n 30`, do not re-read unchanged files, write the report incrementally (append a section after each area) so an interrupted session can resume. If context runs low, finish the current area, update the report and tell the owner (Turkish) to continue in a fresh session with "resume from docs/TEST-REPORT.md".
9. Talk to the owner in Turkish. The report: a Turkish summary at the top, technical details in English are fine.

Read first: `CLAUDE.md`, `docs/LAUNCH-PROGRESS.md`, `docs/MANUAL-TEST-SCRIPT.md`, `docs/DEPLOY.md` (skim), `TECH-DOKUMENTATION.md` (skim).

## 1. Baseline (record in the report)

Git commit and tag (`git log --oneline -3`, `git describe --tags`), `git status --short` (must be clean before you start), tool versions (uv, python, node, npm, docker, supabase CLI), machine notes.

## 2. Static checks and unit tests

- Backend: `cd backend && uv run pytest -q` (all pass; note the count). Also run it a second time with `-p no:randomly` only if a flaky test appears.
- Frontend (in a scratch copy after `npm ci`, dummy public env inline): `npx tsc --noEmit`, `npm run lint` (0 errors, 0 warnings expected), `npm test` (Vitest), `npm run build` (list the route table).
- Shell/config lint where the tool exists: `shellcheck` on `infrastructure/backup/backup.sh` and `backend/scripts/smoke_auth.sh`; `actionlint` on `.github/workflows/ci.yml`; `promtool check config` and `check rules` for the Prometheus files; `caddy validate` for `infrastructure/prod/Caddyfile`; JSON validity of `n8n/Vindera_Daily_Scan.json`.
- Docker: `docker build` of `backend/Dockerfile` (do not push), run the image with production settings and dummy secrets: container runs as non-root, exactly ONE uvicorn process, healthcheck healthy, `/healthz` 200, `/openapi.json`, `/docs`, `/redoc` 404, `/api/v1/deals/scans` 401, `/metrics` 401 without token and 200 with the token, app refuses to start when a production secret is missing or when `ALLOW_MOCK_DATA=true` (each case separately).
- `docker compose config` for `infrastructure/prod` with a complete dummy env file (must succeed) and with empty secrets (must fail); only Caddy publishes 80/443, Grafana only on 127.0.0.1.
- Consistency checks (script it, report the findings): every environment variable read by `backend/src/core/config.py` and `frontend/src` appears in the matching `.env*.example`; every file referenced in `docs/DEPLOY.md` and `docs/MANUEL-ADIMLAR.md` exists; every migration has a header comment; category lists in `backend/src/core/categories.py` and `frontend/src/lib/constants.ts` are identical; migration timestamps are strictly increasing and unique.

## 3. Database (local Supabase)

- `supabase start`, then `supabase db reset --local`: all migrations + seed apply cleanly. Run `supabase db lint`. Re-apply every migration a second time (idempotency) without error.
- Run both SQL suites: `supabase/tests/phase2_smoke.sql` and `supabase/tests/report_summary_smoke.sql` (all checks pass).
- Permissions matrix through the local REST API (real requests, real roles): `anon` cannot read `products`, `opportunities`, `price_history`, `generated_listings`, `sale_events`, `business_settings`, `business_expenses`, `scan_jobs`, `watchlist_asins`, `audit_log`, `admin_users`; `anon` CAN read `storefront_listings` and it contains no quarantined, deleted, sold or pending unit and none of the private columns; a logged-in NON-admin user sees nothing of the admin tables; an admin can read them; no browser role can INSERT/UPDATE/DELETE anything except the column-level UPDATE of `opportunities.invoice_url`/`invoice_path`; RPC functions are not executable by `anon`/`authenticated`.
- Ledger and safety guards: `sale_events` refuses UPDATE/DELETE/TRUNCATE; a sold unit cannot be deleted or soft-deleted; products cannot be deleted while units exist; duplicate open scan row and duplicate SKU are refused; invalid status is refused.
- Storage: `invoices` bucket is private; anonymous access is denied; an admin can upload a small PDF and gets a working signed URL; wrong MIME type / oversize is refused.
- `supabase/scripts/cleanup_test_data.sql` (run ONLY on the local DB with test rows you create): dry run changes nothing and reports; a wrong/unknown ASIN, an empty list, the example ASIN and a missing confirmation text are all refused; a real run removes exactly the listed test units, leaves everything else and switches both guard triggers back on; the audit trail contains the removal.

## 4. Backend API integration (real backend process on :8100 against local Supabase)

Use real Supabase tokens (create a local admin, a local non-admin, a tampered token). Keepa/OpenAI/Pushover are replaced by local stub servers (if the code cannot be pointed at a stub, use the existing test doubles and say so).

- Auth matrix: every route under `/api/v1` without token = 401; non-admin = 403; admin = success; `X-Vindera-Key` works only on `POST /deals/scan`, `POST /deals/dead-stock/scan`, `GET /deals/watchlist` and nowhere else; wrong key = 401. Only `/healthz` and `/readyz` are public (`/readyz` = 503 while the database is unreachable and 200 again after). `/metrics` needs the bearer token.
- Rate limits trigger (429) on `/chat`, `/deals/scan` and the general limit; CORS: an allowed origin gets the headers, a foreign origin does not; preflight works for the allowed methods/headers only.
- Validation: bad ASIN, bad status, negative/absurd prices, non-https and non-willhaben.at URLs, oversized text, unknown fields = 422 with readable messages.
- Chatbot: `/list`, `/scan`, `/help` work; there is no delete command or tool; messages over the limit are refused.
- Scan pipeline with stubs: success -> `succeeded` job + pending deal with computed net profit/score, real-looking price history, one listing; guardrail failure -> `rejected` (stored, no listing, no push); Keepa error / out of tokens / OpenAI error or refusal -> `failed` job, nothing written, no push; same ASIN twice -> still ONE open row; hot deal push at most once per product per 7 days; the "tokens exhausted" push at most once per day; max 2 scans in parallel; the event loop stays responsive during a scan (`/healthz` answers while a scan runs); jobs left `running`/`queued` are closed at startup.
- Lifecycle through the API: pending -> bought (requires purchase data, return-by date set) -> in_inventory -> listed -> sold -> return (refund event, quarantine, target price kept) -> re-list -> sold again; every illegal transition = 409; concurrent double-sale attempt = one wins; soft delete hides the unit everywhere (workspace query, storefront, chat `/list`, dead-stock scan) and is refused for a unit with sales; manual create/update (including quantity N and the duplicate-open-row 409).
- Money: the profit engine against `backend/tests/data/profit_golden_vectors.json` through the API (not only unit tests); actual profit is computed by the backend and a client-sent value is ignored.
- Reports: `GET /reports/summary?year=` and `export.csv` against a hand calculation you write down in the report (revenue, cost of goods, shipping, fees, gross, expenses, profit before tax, ROI, VAT-threshold percent, cash view); another year is empty; refunds are negative; more than 1000 rows still sum correctly; CSV has BOM, `;` separator, decimal comma and the formula-injection guard.
- Inventory alerts: dead stock (age from `received_at`) and return-deadline digests are sent once and only for eligible units.
- Logs and errors: JSON logs with request id; no secret, token or `key=` value appears in any log line (grep the captured logs); an unhandled exception returns JSON 500 with request id and no stack trace; `X-Request-Id` handling.

## 5. Frontend in a real browser (production build on :3100, local backend + Supabase)

Use the built-in browser tools if available, otherwise headless Chrome via Playwright from the scratchpad. Prefer text reads over screenshots. For every page record: loads without console errors or hydration warnings, no failed network requests, no Content-Security-Policy violations.

- Public: `/` (empty state and with seeded units, category filter, search, "load more", recently viewed), `/product/[id]` (view-source: title, description, canonical, Open Graph, Product JSON-LD with EUR price/availability/condition; a quarantined, sold, deleted, unknown and malformed id give the friendly 404; missing Willhaben URL = disabled button), `/impressum`, `/datenschutz`, `/robots.txt`, `/sitemap.xml` (only sellable units, no admin URL), `noindex` on `/admin/*`, custom 404 page. Crawl the storefront and check for broken internal links.
- **Logo/header change (release v2.7.1):** on `/admin/products`, `/admin/manual-entry` and `/admin/reports` the small "WORKSPACE" caption under the "VINDERA" logo text is gone in light AND dark mode (no leftover empty gap, the logo box and the text stay vertically aligned); the navigation tab labelled "Workspace" (link to `/admin`) is still there and still highlighted correctly on `/admin`; `/admin` and `/admin/login` look unchanged.
- Admin login: wrong password message, non-admin account is rejected, admin lands on the dashboard, sign out, 401 from the backend signs the user out.
- Follow `docs/MANUAL-TEST-SCRIPT.md` completely (manual deal, Bought modal, receiving checklist, Listed, Willhaben URL validation, Sold modal, Return, re-list, re-sell, Reports incl. year selector/VAT bar colours/CSV, expenses, Product Master paging/filters/CSV, soft delete, invoice upload and signed-URL viewing, Scans list, dead-stock/return-by badges) and compare every number with the expected values.
- Dark/light mode on every admin page and modal (scan for light-coloured surfaces in dark mode), the toggle persists across reloads, no hydration error with a stored dark theme.
- Errors are never silent: stop the backend and check the toast/inline errors on Save, Sale modal, Reports (with Retry), Product Master, Manual Entry; modals stay open on failure.
- Responsive: 375px (phone), 768px (tablet) and 1440px: no horizontal page scroll on the storefront and no unreachable controls on admin pages (note that the workspace is a desktop layout).
- Basic accessibility: page titles, `lang` attribute, image alt text on the storefront, keyboard focus reaches the main buttons and modals can be closed with Escape or their button.
- Bundle hygiene: search the built `.next` output for secrets patterns (service role key, `eyJ` tokens other than the anon key, `sk-`, `AUTOMATION_SHARED_SECRET`, `METRICS_TOKEN`); response headers of the production build (CSP, X-Frame-Options, Referrer-Policy, nosniff).

## 6. Security and dependencies

- Secret scan of the tracked tree and the git history (patterns for JWTs, `sk-`, private keys, `.env` file names); confirm only `*.example` templates are tracked.
- `npm audit --omit=dev` (frontend) and a Python dependency audit if a tool is available offline-safe (`uv pip list` + `pip-audit` if installed); list findings by severity, do not upgrade anything.
- Production mode of the backend: docs off, `/metrics` protected, CORS not wildcard, no localhost origin allowed, secrets length enforced, mock data refused, every `/api/v1` route protected (the startup guard actually blocks an unprotected router: prove it with a scratch router in a scratch copy).
- Try to abuse: SQL/HTML/script payloads in text fields (titles, descriptions, notes) do not execute in the storefront or admin UI and cannot break the JSON-LD; oversized bodies; malformed JSON; path traversal in invoice file names; IDOR-style access with a non-admin token.

## 7. Operations artifacts

- `infrastructure/backup/backup.sh` against the LOCAL database: dump works, optional `age` encryption round-trips, wrong password / missing URL fail without leaving a partial file, retention only removes old backup files; restore into a scratch database and compare row counts.
- Production compose + Caddyfile + Prometheus config consistency (service names, ports, token flow, healthchecks), `docs/DEPLOY.md` commands are syntactically valid and refer to existing paths, `docs/MANUEL-ADIMLAR.md` and `docs/LAUNCH-CHECKLIST.tr.md` do not contradict `docs/DEPLOY.md` (list contradictions).
- n8n workflow: valid JSON, both HTTP nodes send the automation header from a credential (no secret in the file), watchlist node feeds the scan node, base URL variable present.
- CI workflow: syntax valid, needs no secrets, the same commands as sections 2-3.

## 8. The live public site (read-only, no login, no writes)

`https://vindera-frontend.vercel.app`: `GET` `/`, `/impressum`, `/datenschutz`, `/admin/login`, `/product/00000000-0000-0000-0000-000000000000` (expect friendly 404), `/robots.txt`, `/sitemap.xml`; status codes, response headers (CSP, X-Frame-Options, Referrer-Policy, nosniff, HSTS), page loads in the browser without console errors, the "WORKSPACE" caption fix is NOT expected on the public storefront (it is in the admin pages); confirm the deployed admin pages carry the change after the owner's push (only if the deployment already contains v2.7.1; otherwise mark "not yet deployed").
Then, using only the public anon key that the site ships in its JavaScript, send read-only `GET` requests to the hosted Supabase REST API: `storefront_listings` is readable; `products`, `opportunities`, `price_history`, `generated_listings`, `sale_events`, `business_settings`, `business_expenses`, `scan_jobs`, `watchlist_asins`, `audit_log`, `admin_users` return an error or an empty result for `anon`. Never send POST/PATCH/DELETE to the hosted project. Never print the key in the report.

## 9. The report: `docs/TEST-REPORT.md`

Structure:
1. **Özet (Turkish, max 15 lines):** verdict (GO / GO with conditions / NO-GO for going live), counts (passed / failed / not tested), the top issues, what the owner must do.
2. Environment and baseline (commit, tag, versions, dates).
3. Result table per area (2-8): test, result (PASS / FAIL / NOT TESTED), evidence pointer.
4. Findings: for each failure or risk: ID, severity (Blocker / Major / Minor / Info), area, what happened, expected, steps to reproduce, evidence, suggested owner of the fix (backend / frontend / SQL / config / docs / manual step). Order by severity.
5. Not tested and why (slow machine, needs real server, needs real keys, ...).
6. Cleanup proof: servers/containers stopped, local Supabase stopped, `git status --short` output, confirmation that no tracked file changed and nothing was pushed.
7. Recommended next steps (ordered), max 10.

Finish with a short Turkish chat summary: verdict, the 3-5 most important findings, and the path of the report. Then stop.
