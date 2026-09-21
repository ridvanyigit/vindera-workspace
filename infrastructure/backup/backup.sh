#!/usr/bin/env bash
# Vindera database backup: pg_dump of the Supabase Postgres (schemas public + auth),
# checked, optionally encrypted, with retention. Belt and braces: it complements
# Supabase's own backups (Pro plan: daily backups / PITR), it does not replace them.
#
# What is saved: your tables (deals, sales ledger, expenses, settings, audit log) and
# the login accounts. NOT saved: the invoice files in Storage (copy those separately).
#
# Configuration comes from the environment or from the file backup.env next to this
# script (copy backup.env.example; it is git-ignored). The connection string contains
# the database password: it is never printed and never passed on a command line.
#
#   SUPABASE_DB_URL        required. Dashboard -> Connect -> "Session pooler" string
#                          (works over IPv4), e.g. postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
#   BACKUP_DIR             default: $HOME/vindera-backups
#   BACKUP_RETENTION_DAYS  default: 30
#   BACKUP_AGE_RECIPIENT   optional: an `age` public key (age1...). Backups are then
#                          encrypted and the plain copy is removed. Needs `age` installed.
#   BACKUP_PING_URL        optional: a "dead man's switch" URL (e.g. healthchecks.io) that is
#                          called after every SUCCESSFUL run; you get a message when it stops arriving.
#   PG_IMAGE               default: postgres:17-alpine (pg_dump runs in Docker so its
#                          version always matches; a newer client can dump an older server)
#   PG_DUMP_LOCAL=1        use pg_dump/pg_restore from PATH instead of Docker
#
# Cron (daily 03:30 server time, log kept):
#   30 3 * * * /opt/vindera/infrastructure/backup/backup.sh >> /var/log/vindera-backup.log 2>&1
#
# Restore drill: docs/DEPLOY.md, section "Backups and restore drill".

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${BACKUP_ENV_FILE:-$SCRIPT_DIR/backup.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$HOME/vindera-backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

log() { printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

[[ -n "${SUPABASE_DB_URL:-}" ]] || fail "SUPABASE_DB_URL is not set (see backup.env.example)"
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || fail "BACKUP_RETENTION_DAYS must be a whole number"
export SUPABASE_DB_URL

use_docker() {
  [[ "${PG_DUMP_LOCAL:-0}" != "1" ]] || return 1
  command -v docker >/dev/null 2>&1 || fail "docker not found (install Docker, or set PG_DUMP_LOCAL=1 and install postgresql-client-17)"
}

# pg_dump of schemas public and auth to stdout. In Docker the URL is handed over as an environment
# variable (`-e NAME` without a value copies it from ours) and read by `sh -c`, so it never appears
# in an argument list.
dump() {
  if use_docker; then
    docker run --rm -e SUPABASE_DB_URL "$PG_IMAGE" \
      sh -c 'pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges --schema=public --schema=auth'
  else
    pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges --schema=public --schema=auth
  fi
}

# (PG_DUMP_LOCAL=1 has to pass the URL as an argument, so it is visible in `ps` to other users of
# this machine while the dump runs; the Docker mode does not have that weakness.)

# Table of contents of a dump file (proves the archive can be read back).
list_contents() {
  if use_docker; then
    docker run --rm -i "$PG_IMAGE" pg_restore --list < "$1"
  else
    pg_restore --list "$1"
  fi
}

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$BACKUP_DIR/vindera-$stamp.dump"
partial="$final.partial"
trap 'rm -f "$partial"' EXIT

log "dumping schemas public and auth to $final"
# Custom format: compressed, and pg_restore can restore parts of it. --no-owner / --no-privileges
# because roles differ between Supabase projects.
dump > "$partial" || fail "pg_dump failed (wrong connection string, password or network?)"
[[ -s "$partial" ]] || fail "the dump is empty"

# A backup that cannot be read back is worthless: list its table of contents before trusting it.
entries="$(list_contents "$partial" | grep -c 'TABLE DATA' || true)"
[[ "$entries" -ge 1 ]] || fail "the dump has no table data; not keeping it"
mv "$partial" "$final"
log "dump verified ($entries tables with data, $(du -h "$final" | cut -f1))"

if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]]; then
  command -v age >/dev/null 2>&1 || fail "BACKUP_AGE_RECIPIENT is set but age is not installed (apt install age)"
  age -r "$BACKUP_AGE_RECIPIENT" -o "$final.age" "$final" || { rm -f "$final.age"; fail "encryption failed; plain dump kept at $final"; }
  rm -f "$final"
  final="$final.age"
  log "encrypted to $final"
fi

# Retention: remove backups older than N days (only files this script creates).
removed="$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'vindera-*.dump' -o -name 'vindera-*.dump.age' \) -mtime +"$BACKUP_RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')"
log "retention: $removed file(s) older than $BACKUP_RETENTION_DAYS days removed"

if [[ -n "${BACKUP_PING_URL:-}" ]]; then
  if curl -fsS -m 10 --retry 3 -o /dev/null "$BACKUP_PING_URL"; then
    log "ping sent"
  else
    log "WARNING: could not reach the ping URL"
  fi
fi

log "done: $final"
