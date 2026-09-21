# Vindera backend image (FastAPI). Build context: backend/
#
#   docker build -t vindera-backend backend
#
# Two stages: the first resolves and installs the locked dependencies with uv, the
# second copies only the finished virtualenv and the application code into a slim
# image that runs as an unprivileged user. Nothing from the host (.env, .venv,
# tests) is copied in; see .dockerignore.
#
# ONE uvicorn worker on purpose: the Prometheus business metrics
# (vindera_scan_jobs_total, ...) live in process memory, and the scan semaphore and
# the rate limiter are per process too. Do not raise --workers without adding
# Prometheus multiprocess mode first.

FROM python:3.14-slim-bookworm AS builder

# uv, pinned; the Python interpreter comes from the base image (never downloaded).
COPY --from=ghcr.io/astral-sh/uv:0.9.0 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app
COPY pyproject.toml uv.lock ./
# --locked: fail instead of silently re-resolving when uv.lock and pyproject.toml disagree.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project


FROM python:3.14-slim-bookworm

RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY src ./src

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER app
EXPOSE 8000

# /healthz answers as long as the process serves requests; it never touches the database,
# so a Supabase outage does not make Docker restart a healthy container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)"]

# --proxy-headers / --forwarded-allow-ips: the container is reachable only through the Caddy
# reverse proxy (see infrastructure/prod), so the client address for the rate limiter is
# taken from X-Forwarded-For. Never publish this port directly to the internet.
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
