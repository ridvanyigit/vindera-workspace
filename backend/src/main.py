from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from src.core.database import supabase

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Vindera Backend is starting up...")
    
    # Test Supabase Connection on startup
    try:
        # We try to fetch 1 row from our 'products' table to test the connection
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