from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from src.core.database import supabase
from src.api.endpoints import deals, chat
from prometheus_fastapi_instrumentator import Instrumentator

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Vindera Backend is starting up...")
    try:
        response = supabase.table('products').select("*").limit(1).execute()
        print("✅ SUCCESS: Connected to Supabase Database successfully!")
    except Exception as e:
        print(f"❌ ERROR: Failed to connect to Supabase: {str(e)}")
    yield
    print("Vindera Backend is shutting down...")

app = FastAPI(
    title="Vindera API",
    description="Cross-Border Arbitrage Backend for Amazon & Keepa",
    version="1.0.0",
    lifespan=lifespan
)

# Initialize Prometheus Metrics
Instrumentator().instrument(app).expose(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "Welcome to Vindera API - Cross-Border Arbitrage Engine is running."
    }

# Register Routers
app.include_router(deals.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")