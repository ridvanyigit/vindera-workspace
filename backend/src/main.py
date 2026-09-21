"""FastAPI application entrypoint.

Run with:
    cd backend && uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
"""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from src.api.endpoints import chat, deals, expenses
from src.core.auth import assert_routes_protected, require_metrics_token
from src.core.config import settings
from src.core.database import supabase
from src.core.rate_limit import limiter

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Vindera Backend is starting up...")
    try:
        supabase.table("products").select("*").limit(1).execute()
        print("✅ SUCCESS: Connected to Supabase Database successfully!")
    except Exception as e:
        print(f"❌ ERROR: Failed to connect to Supabase: {str(e)}")
    if settings.METRICS_TOKEN is None:
        print("WARNING: METRICS_TOKEN is not set; /metrics is open (development only).")
    yield
    print("Vindera Backend is shutting down...")


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

# Rate limiting: default and application budgets apply through the middleware;
# the stricter per-route limits are declared on the handlers.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Origins are explicit because credentials are allowed; a wildcard would be
# rejected by browsers and would expose the API to any site.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "Welcome to Vindera API - Cross-Border Arbitrage Engine is running.",
    }


app.include_router(deals.router, prefix=API_PREFIX)
app.include_router(deals.automation_router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(expenses.router, prefix=API_PREFIX)

# Refuse to start if any /api/v1 route was added without authentication.
assert_routes_protected(app, API_PREFIX)
