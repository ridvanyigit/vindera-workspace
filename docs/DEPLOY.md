# Vindera production runbook

Step-by-step guide to run Vindera in production. The accounts, the server and the domain are yours to create; everything else in this repository is ready. Nothing in this document has been run against a real server: the pieces were verified locally (see "What was verified" at the end), the first real deployment is the real test, so go slowly and check each step.

## 1. Architecture

```
 visitors / admin browser
        |                         DNS
        |  https://www.<domain>   ---->  Vercel (Next.js frontend)
        |  https://api.<domain>   ---->  ┌───────────────── VPS (Hetzner, Germany) ─────────────────┐
        |  https://n8n.<domain>   ---->  │ Caddy :80/:443  (automatic HTTPS, the ONLY public ports) │
        |                                │   ├─ api.<domain>  -> backend:8000   (/metrics hidden)   │
        |                                │   └─ n8n.<domain>  -> n8n:5678                           │
        |                                │ backend (FastAPI, 1 worker)   n8n   prometheus   grafana │
        |                                │ Grafana only on 127.0.0.1:3002 (SSH tunnel)              │
        |                                └───────────────────────────────────────────────────────────┘
        └──────────────>  Supabase (hosted, EU / Frankfurt): Postgres, Auth, Storage
```

- The backend talks to Supabase with the service-role key, to Keepa, OpenAI and Pushover. Nobody can reach it without an admin login or a secret.
- n8n runs the daily scan and reaches the backend over the private Docker network (`http://backend:8000`).
- One backend worker on purpose: the Prometheus metrics are kept per process.

All server files are in `infrastructure/prod/`; the backup script is in `infrastructure/backup/`.

## 2. What you need (accounts and costs are yours to arrange)

| What | Why | Note |
|---|---|---|
| A domain | `www.`, `api.` and `n8n.` addresses | Any registrar |
| A VPS in the EU | Runs the backend, n8n, monitoring | Hetzner Cloud, Ubuntu 24.04, 2 vCPU / 4 GB is plenty (e.g. CX22), Falkenstein or Nuremberg |
| Supabase project (already exists) | Database, login, files | Pro plan recommended: daily backups, no pausing |
| Vercel account | Hosts the frontend | Free plan is enough to start |
| Optional: Sentry, UptimeRobot, healthchecks.io | Errors, uptime alarm, backup alarm | All have free tiers |
| Pushover, Keepa, OpenAI keys | Phone alerts, prices, AI | Set a monthly spending cap at OpenAI |

## 3. DNS

Create these records at your registrar (the server address is on the Hetzner console):

| Name | Type | Value |
|---|---|---|
| `api` | A (and AAAA if the server has IPv6) | server IP |
| `n8n` | A (and AAAA) | server IP |
| `www` (and the bare domain) | as Vercel tells you in step 9 | |

Check before going on: `dig +short api.<domain>` must print the server IP. Caddy cannot get certificates until this works.

## 4. Prepare the server (once)

Log in as root over SSH, then:

```bash
# A normal user for daily work (replace "vindera" if you like) with your SSH key
adduser --disabled-password --gecos "" vindera
usermod -aG sudo vindera
mkdir -p /home/vindera/.ssh && cp ~/.ssh/authorized_keys /home/vindera/.ssh/ && chown -R vindera:vindera /home/vindera/.ssh
echo 'vindera ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/vindera        # or keep the password prompt

# SSH: keys only, no root login
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh        # keep this session open and test a second login as "vindera" BEFORE closing it

# Updates and firewall
apt-get update && apt-get -y upgrade && apt-get -y install unattended-upgrades ufw curl git age
ufw default deny incoming && ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
timedatectl set-timezone Europe/Vienna

# Docker Engine + compose plugin (official repository)
curl -fsSL https://get.docker.com | sh
usermod -aG docker vindera
```

Also switch on the **Hetzner Cloud Firewall** (console -> Firewalls): allow inbound 22 (from your own IP if it is stable), 80, 443 (tcp) and 443 (udp). Docker publishes ports around `ufw`, so the cloud firewall is the perimeter that really counts. In this stack only Caddy publishes 80/443, and Grafana publishes on the loopback address only.

Log in again as `vindera` for everything that follows.

## 5. Get the code onto the server

The repository has no remote yet. Either:

- **Private Git repository** (recommended): push the `launch-hardening` branch (or `main` once merged) to a private GitHub repository, create a read-only deploy key (`ssh-keygen -t ed25519`, add the public key under Repository -> Settings -> Deploy keys) and `git clone git@github.com:<you>/<repo>.git /opt/vindera`.
- **Copy from your Mac**: `rsync -a --exclude node_modules --exclude .next --exclude .venv --exclude '.env*' --exclude backups ./ vindera@<server>:/opt/vindera/` (run from the workspace root; the excludes keep your local secret files at home).

After the code is in `/opt/vindera` (create the folder first with `sudo mkdir -p /opt/vindera && sudo chown vindera:vindera /opt/vindera`):

```bash
cd /opt/vindera/infrastructure/prod
```

## 6. Configure `.env.prod`

```bash
cp .env.prod.example .env.prod && chmod 600 .env.prod
nano .env.prod
```

Fill in every line (the comments in the file explain each one). Generate the random values on the server with `openssl rand -hex 32`:

| Variable | Where the value comes from |
|---|---|
| `API_DOMAIN`, `N8N_DOMAIN`, `ACME_EMAIL` | your domain; your e-mail |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard -> Project Settings -> API. **Use a freshly rotated service_role key** (docs/MANUEL-ADIMLAR.md M3) |
| `CORS_ALLOWED_ORIGINS` | the exact frontend origin(s), e.g. `https://www.<domain>` (comma-separated, no localhost) |
| `AUTOMATION_SHARED_SECRET`, `METRICS_TOKEN`, `N8N_ENCRYPTION_KEY`, `GRAFANA_ADMIN_PASSWORD` | `openssl rand -hex 32` each. **Keep a copy of `N8N_ENCRYPTION_KEY` in your password manager**: without it n8n's stored credentials cannot be read after a rebuild |
| `OPENAI_API_KEY`, `KEEPA_API_KEY`, `PUSHOVER_*`, `SENTRY_DSN` | your accounts; leave empty to switch a feature off (a scan then fails visibly, it never invents data) |

The backend refuses to start in production with a missing secret, a short secret (< 32 characters), a localhost CORS entry or mock data switched on, and prints why in `docker compose logs backend`.

## 7. First start

```bash
docker compose --env-file .env.prod config -q       # prints nothing when the file is complete
docker compose --env-file .env.prod up -d --build
docker compose --env-file .env.prod ps              # every service "running", backend "healthy"
docker compose --env-file .env.prod logs -f caddy   # look for "certificate obtained successfully", then Ctrl-C
```

Always pass `--env-file .env.prod`. To avoid typing it, `export COMPOSE_ENV_FILES=.env.prod` in your shell.

## 8. Smoke tests

From your own computer (not the server):

```bash
BEHIND_PROXY=1 EXPECT_PRODUCTION=1 BASE_URL=https://api.<domain> backend/scripts/smoke_auth.sh
```

It must end with "All checks passed": every `/api/v1` route answers 401 without login, `/healthz` and `/readyz` are 200, `/docs` and `/metrics` are 404. (`BEHIND_PROXY=1` is because Caddy hides `/metrics`; add `AUTOMATION_KEY=...` for more checks.) By hand:

```bash
curl -i https://api.<domain>/healthz        # 200 {"status":"ok"}, with Strict-Transport-Security
curl -i https://api.<domain>/readyz         # 200 {"status":"ready"}; 503 means the database is not reachable (check SUPABASE_URL / the key)
curl -i https://api.<domain>/metrics        # 404
```

On the server, check that Prometheus sees the backend:

```bash
docker compose --env-file .env.prod exec prometheus wget -qO- 'http://localhost:9090/api/v1/query?query=up'
# "value":[...,"1"] for job vindera_fastapi. A 0 usually means METRICS_TOKEN differs between services (it is one variable, so re-run `up -d`).
```

## 9. Frontend on Vercel

1. Vercel -> Add New -> Project -> import the repository. **Root Directory: `frontend`**. Framework: Next.js (auto-detected). Node.js version: 24.
2. Settings -> Environment Variables (Production and Preview), the four public values from `frontend/.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the anon key, never the service_role key), `NEXT_PUBLIC_API_URL` = `https://api.<domain>`, `NEXT_PUBLIC_SITE_URL` = `https://www.<domain>`.
3. Deploy. Then Settings -> Domains: add `www.<domain>` (and the bare domain, redirecting) and create the DNS records Vercel shows.
4. The values are read at build time: change one, then redeploy.
5. Now that the frontend address is final, make sure `CORS_ALLOWED_ORIGINS` in `.env.prod` is exactly that origin, and apply it: `docker compose --env-file .env.prod up -d backend`.
6. Supabase Dashboard -> Authentication -> URL Configuration: Site URL = `https://www.<domain>`, and add it to the redirect URLs (docs/MANUEL-ADIMLAR.md M2).

## 10. Database migrations

The 13 launch-hardening migrations are already on the hosted project (done by you on 2026-09-21). For every later migration, from your own computer, in this order: **backup** (Supabase Dashboard -> Database -> Backups, and run `infrastructure/backup/backup.sh`), `supabase db push --dry-run`, `supabase db push`, `supabase migration list`. Never run `supabase db push` from the server. Deploy backend code that needs a new column only after the migration is in.

## 11. First admin user

1. Supabase Dashboard -> Authentication -> Users -> Add user -> Create new user (tick auto-confirm), with your e-mail and a strong password.
2. SQL Editor:
   ```sql
   insert into public.admin_users (user_id, email)
   select id, email from auth.users where email = 'YOUR-EMAIL';
   select * from public.admin_users;     -- exactly one row: you
   ```
3. Turn off public sign-ups (Authentication -> Sign In / Providers) and enrol a TOTP authenticator for the account (docs/MANUEL-ADIMLAR.md M2, M9).
4. Open `https://www.<domain>/admin/login`, sign in, and check that the dashboard loads without red error banners.

## 12. n8n (daily scan)

1. Open `https://n8n.<domain>`: n8n asks you to create the **owner account** on first visit. Do it immediately, with a strong password (the address is public until you do).
2. Workflows -> Import from file -> `n8n/Vindera_Daily_Scan.json`.
3. Credentials -> New -> **Header Auth**: name `Vindera Automation Key`, header name `X-Vindera-Key`, value = your `AUTOMATION_SHARED_SECRET`. Open each HTTP Request node in the workflow and select this credential.
4. The workflow reads the backend address from `VINDERA_API_BASE_URL`, which the compose file already points at `http://backend:8000`. Nothing to edit.
5. Execute the workflow once by hand. In Supabase Table Editor -> `scan_jobs` there must be new rows (`succeeded`, `rejected`, or `failed` with a readable reason such as missing Keepa tokens). Then switch the workflow to **Active**.
6. The list of watched products is the `watchlist_asins` table (edit it in the Table Editor).

## 13. Monitoring and alerts

- **Grafana** (never over the internet): `ssh -L 3002:127.0.0.1:3002 vindera@<server>`, then open http://localhost:3002, user `admin`, the password from `.env.prod`. The Prometheus data source is pre-configured. Useful queries in Explore: `vindera_scan_jobs_total`, `vindera_keepa_tokens_left`, `vindera_openai_errors_total`, `rate(http_requests_total[5m])`.
- **Alert rules** (`infrastructure/monitoring/alerts.yml`) are loaded by Prometheus; see which fire with `docker compose --env-file .env.prod exec prometheus wget -qO- http://localhost:9090/api/v1/alerts`. They do not notify anyone yet: delivering them needs an Alertmanager, a later step.
- **The alarm that works today:** an UptimeRobot (or similar) HTTP monitor on `https://api.<domain>/healthz` every 5 minutes with e-mail/push, and Sentry via `SENTRY_DSN` if you want error reports.
- Logs: `docker compose --env-file .env.prod logs --tail 100 backend` (JSON lines with a request id; secrets are masked). Docker rotates them (5 x 10 MB per service).

## 14. Backups and restore drill

Supabase's own backups come first (Pro plan: daily backups; PITR add-on for point-in-time recovery). `infrastructure/backup/backup.sh` is a second, independent copy of your data (tables and login accounts; **not** the invoice files in Storage: download those from Dashboard -> Storage now and then, or keep the originals).

Set up (on the server):

```bash
sudo mkdir -p /var/backups/vindera && sudo chown vindera:vindera /var/backups/vindera
cd /opt/vindera/infrastructure/backup
cp backup.env.example backup.env && chmod 600 backup.env && nano backup.env
```

- `SUPABASE_DB_URL`: Supabase Dashboard -> Connect -> **Session pooler** string (works over IPv4), with your database password in it.
- Encryption (recommended): on **your own computer** `age-keygen -o vindera-backup.key` (install with `brew install age`). Put the public key (`age1...`) in `BACKUP_AGE_RECIPIENT`. Keep the `.key` file in your password manager and **off the server**: a backup you cannot decrypt is no backup.
- Optional `BACKUP_PING_URL` from healthchecks.io (free): it alarms you when the daily ping stops.

Test it once by hand, then schedule it:

```bash
./backup.sh                 # ends with "done: /var/backups/vindera/vindera-<timestamp>.dump[.age]"
crontab -e                  # add:
30 3 * * * /opt/vindera/infrastructure/backup/backup.sh >> /var/log/vindera-backup.log 2>&1
```

The script keeps 30 days and refuses to keep a dump that cannot be read back. The server disk is not a safe place on its own: copy `/var/backups/vindera` off the machine regularly (for example `rsync` or `rclone` to a Hetzner Storage Box or another cloud account).

**Restore drill: do this once now, and again every quarter.** It proves the backup works, into a throw-away database, never over the live one. On your computer, with Docker and the Supabase CLI:

```bash
supabase start                                            # a local, empty Postgres (never link it)
# 1. decrypt (skip when the file is not .age)
age -d -i vindera-backup.key -o restored.dump vindera-<timestamp>.dump.age
# 2. scratch database in the local Postgres, restore into it
DB="postgresql://postgres:postgres@host.docker.internal:54322"
docker run --rm -i postgres:17-alpine psql "$DB/postgres" -c "create database restore_drill template template0"
docker run --rm -i postgres:17-alpine psql "$DB/restore_drill" -c "drop schema public"
docker run --rm -i postgres:17-alpine pg_restore --no-owner --no-privileges -d "$DB/restore_drill" < restored.dump
# 3. look at it: the counts must match what you expect (compare with the live project)
docker run --rm -i postgres:17-alpine psql "$DB/restore_drill" -c \
  "select (select count(*) from public.opportunities) as deals, (select count(*) from public.sale_events) as sales, (select count(*) from public.business_expenses) as expenses, (select count(*) from auth.users) as users"
# 4. clean up
docker run --rm -i postgres:17-alpine psql "$DB/postgres" -c "drop database restore_drill"
```

`pg_restore` should end without errors (`host.docker.internal` is how Docker Desktop on a Mac reaches the local Supabase).

**Real disaster** (data lost or the hosted project is gone): first choice is Supabase's own restore (Pro plan backups or PITR, one click in the Dashboard). Your dump is the last resort and contains everything (tables and login accounts). Loading it into a brand-new Supabase project (apply the migrations, then load the data) has **not** been rehearsed: the drill above proves that the dump is complete and readable, not the full rebuild. Do the rebuild once on a scratch Supabase project before you ever need it, and ask for help before doing it for real.

## 15. Updating to a new version

```bash
cd /opt/vindera && git pull
cd infrastructure/prod
docker tag vindera-backend:prod vindera-backend:previous          # keep the running version for rollback
docker compose --env-file .env.prod up -d --build backend
docker compose --env-file .env.prod ps                            # backend "healthy" again
curl -fsS https://api.<domain>/readyz
```

If the release has migrations: backup, `supabase db push` from your computer (step 10), then update the backend. The frontend updates by itself when you push to the connected branch on Vercel.

## 16. Rollback

- **Backend:** `BACKEND_IMAGE=vindera-backend:previous docker compose --env-file .env.prod up -d --no-build backend`. If the image is gone: `git checkout <last-good-commit>` and `up -d --build backend`.
- **Frontend:** Vercel -> Deployments -> the last good one -> Promote to Production.
- **n8n / Caddy / monitoring:** `docker compose --env-file .env.prod up -d` with the previous `N8N_IMAGE_TAG`; the data lives in Docker volumes and survives.
- **Database:** there are no automatic "down" migrations. A bad migration is fixed by a new corrective migration; lost or damaged data is restored from a Supabase backup / PITR or from your dump (step 14). This is why every migration is preceded by a backup.

## 17. When something is wrong

| Symptom | Look at |
|---|---|
| Caddy: "no certificate" / browser warning | DNS not yet pointing at the server, ports 80/443 blocked by a firewall; `docker compose logs caddy` |
| Backend restarts in a loop | `docker compose logs backend`: "Unsafe production configuration: ..." names the missing or wrong setting |
| `/readyz` 503 | `SUPABASE_URL` or the service key is wrong, or Supabase is down; check the Supabase status page |
| The site shows errors, the browser console mentions CORS | `CORS_ALLOWED_ORIGINS` is not exactly the frontend origin (scheme + host, no trailing slash); after fixing: `up -d backend` |
| Admin login works but every page says 401/403 | the account is not in `admin_users` (step 11) |
| n8n scans get 401 | the Header Auth credential value differs from `AUTOMATION_SHARED_SECRET`, or the credential is not selected on the HTTP nodes |
| Scans end `failed` | read the `error` column of `scan_jobs`: "Keepa: ... tokens" = plan or refill, "OpenAI API key is not configured" = key missing |
| Disk filling up | `docker system df`; old backups (`/var/backups/vindera`), `docker image prune` |
| Everyone is rate limited (429) | uvicorn must see the real client address: it is started with `--proxy-headers` for that; the backend must not be reachable except through Caddy |

## 18. What was verified (and what was not)

Verified on the developer machine, against a local Supabase only: the backend image builds, starts as an unprivileged user with one worker, reports healthy, answers `/healthz` 200, `/readyz` 200 (503 without a database), `/docs` 404, unauthenticated API 401; `smoke_auth.sh` passes against it directly and through a Caddy proxy (`BEHIND_PROXY=1`, `/metrics` hidden even with the token); `docker compose config` accepts the production file with a complete env file and refuses one with an empty secret; only Caddy publishes public ports; the Caddyfile validates; the Prometheus config and alert rules pass `promtool`; the backup script ran against a local database, verified the dump, encrypted it with `age`, decrypted it again and restored it into a scratch database with matching counts (a full rebuild into a new Supabase project was not tried); shellcheck is clean.

**Not verified:** anything on a real server (certificate issuance, the firewall, DNS, Docker Engine on Ubuntu, memory sizing), Vercel, n8n's first-run screens and the workflow import on the production image, the Grafana data source, an end-to-end scan with real Keepa/OpenAI keys, the Hetzner/Supabase pooler connection string, cron.
