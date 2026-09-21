"""Liveness and readiness probes for the load balancer / uptime monitor.

Deliberately public and free of data: they answer only "up" or "not ready".
`/healthz` never touches a dependency, so a database outage cannot make an
orchestrator restart a healthy process; `/readyz` does one cheap query.
"""

import asyncio
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.core.database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])

READY_TIMEOUT_SECONDS = 5


@router.get("/healthz")
async def healthz():
    """The process is up and serving requests."""
    return {"status": "ok"}


@router.get("/readyz")
async def readyz():
    """The process can reach its database."""
    try:
        await asyncio.wait_for(
            asyncio.to_thread(lambda: supabase.table("business_settings").select("id").limit(1).execute()),
            timeout=READY_TIMEOUT_SECONDS,
        )
    except Exception as e:
        # The reason goes to the log; the public answer stays generic.
        logger.warning("Readiness check failed: %s", type(e).__name__)
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ready"}
