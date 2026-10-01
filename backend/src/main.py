"""FastAPI application entrypoint.

Run with:
    cd backend && uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir src
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.api.endpoints import chat, deals, expenses, health, reports
from src.core.auth import assert_routes_protected, require_metrics_token
from src.core.config import settings
from src.core.database import supabase
from src.core.logging_config import configure_logging
from src.core.middleware import RequestContextMiddleware, UnhandledErrorMiddleware
from src.core.observability import init_langfuse
from src.core.rate_limit import ApplicationRateLimitMiddleware, limiter
from src.core.sentry import init_sentry
from src.services.scan_pipeline import fail_interrupted_scan_jobs

API_PREFIX = "/api/v1"

# Logging, Sentry and (optionally) Langfuse start before the app object exists,
# and before any agent module is imported, so that the OpenAI SDK patch (if
# Langfuse is configured) is already in place when the agents create their clients.
configure_logging()
init_sentry()
init_langfuse()
logger = logging.getLogger("vindera.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Vindera backend starting (environment: %s)", settings.ENVIRONMENT)
    try:
        await asyncio.to_thread(lambda: supabase.table("business_settings").select("id").limit(1).execute())
        logger.info("Connected to the database")
    except Exception as e:
        # Not fatal: /readyz reports the state and requests fail with a clear error until it recovers.
        logger.error("Could not reach the database at startup: %s", type(e).__name__)
    else:
        try:
            await fail_interrupted_scan_jobs()
        except Exception:
            logger.exception("Could not close interrupted scan jobs")
    if settings.METRICS_TOKEN is None:
        logger.warning("METRICS_TOKEN is not set; /metrics is open (development only)")
    yield
    logger.info("Vindera backend shutting down")


# The interactive API docs describe every endpoint; they are development-only.
_docs_enabled = not settings.is_production

app = FastAPI(
    title="Vindera API",
    description="Cross-Border Arbitrage Backend for Amazon & Keepa",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

# Prometheus metrics at /metrics, guarded by a bearer token.
Instrumentator().instrument(app).expose(
    app, include_in_schema=False, dependencies=[Depends(require_metrics_token)]
)

# Innermost (added first): turns an unexpected exception into a JSON 500 that still
# passes through CORS. Details go to the log only, never to the caller.
app.add_middleware(UnhandledErrorMiddleware)

# Rate limiting: default and application budgets apply through the middleware;
# the stricter per-route limits are declared on the handlers. Not slowapi's stock
# SlowAPIMiddleware: see the docstring on ApplicationRateLimitMiddleware for why.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(ApplicationRateLimitMiddleware)

# Origins are explicit because credentials are allowed; a wildcard would be
# rejected by browsers and would expose the API to any site.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Added last, so it is outermost: every request gets an id and one log line.
app.add_middleware(RequestContextMiddleware)

app.include_router(health.router)
app.include_router(deals.router, prefix=API_PREFIX)
app.include_router(deals.automation_router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(expenses.router, prefix=API_PREFIX)
app.include_router(reports.router, prefix=API_PREFIX)

# Refuse to start if any /api/v1 route was added without authentication.
assert_routes_protected(app, API_PREFIX)
