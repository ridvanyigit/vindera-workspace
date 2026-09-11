from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions (e.g., connecting to databases)
    print("Vindera Backend is starting up...")
    yield
    # Shutdown actions
    print("Vindera Backend is shutting down...")

app = FastAPI(
    title="Vindera API",
    description="Cross-Border Arbitrage Backend for Amazon & Keepa",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware (Allows our Next.js frontend to communicate with this API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # We will restrict this in production
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

@app.get("/health")
async def health_check():
    return {"status": "healthy"}