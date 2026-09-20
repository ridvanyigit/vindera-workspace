"""FastAPI application entrypoint.

Run with:
    cd backend && uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from src.api.endpoints import chat, deals, expenses
from src.core.config import settings
from src.core.database import supabase


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Vindera Backend is starting up...")
    try:
        supabase.table("products").select("*").limit(1).execute()
        print("✅ SUCCESS: Connected to Supabase Database successfully!")
    except Exception as e:
        print(f"❌ ERROR: Failed to connect to Supabase: {str(e)}")
    yield
    print("Vindera Backend is shutting down...")


app = FastAPI(
    title="Vindera API",
    description="Cross-Border Arbitrage Backend for Amazon & Keepa",
    version="1.0.0",
    lifespan=lifespan,
)

# Prometheus metrics at /metrics
Instrumentator().instrument(app).expose(app)

# Origins are explicit because credentials are allowed; a wildcard would be
# rejected by browsers and would expose the API to any site.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "Welcome to Vindera API - Cross-Border Arbitrage Engine is running.",
    }


app.include_router(deals.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(expenses.router, prefix="/api/v1")
