"""Small helpers around the (synchronous) Supabase client.

`call_rpc` runs one of the atomic write functions and turns their SQLSTATE codes
into HTTP errors (see the header of migration 20260921091100). `fetch_all` reads
every row of a query in pages, because PostgREST silently caps a single answer
at 1000 rows and a total computed from a capped answer is wrong without warning.
"""

import logging
from typing import Callable

from fastapi import HTTPException
from postgrest.exceptions import APIError

from src.core.database import supabase

logger = logging.getLogger(__name__)

PAGE_SIZE = 1000

# SQLSTATE raised by the RPC functions -> HTTP status.
_RPC_STATUS = {"22023": 422, "P0002": 404, "55000": 409, "23505": 409}


def _unique_violation_text(message: str) -> str:
    if "sku" in message.lower():
        return "This SKU is already used by another deal."
    return "This product already has an open scan or pending deal. Edit or reject that one first."


def call_rpc(name: str, params: dict) -> dict:
    """Call an RPC function; failures become HTTPException with a readable detail."""
    try:
        return supabase.rpc(name, params).execute().data
    except APIError as e:
        status = _RPC_STATUS.get(str(e.code))
        if status is None:
            logger.exception("RPC %s failed", name)
            raise HTTPException(status_code=500, detail="The database rejected the change.")
        detail = _unique_violation_text(str(e.message)) if e.code == "23505" else str(e.message)
        raise HTTPException(status_code=status, detail=detail)
    except HTTPException:
        raise
    except Exception:
        logger.exception("RPC %s failed", name)
        raise HTTPException(status_code=503, detail="The database is unavailable.")


def fetch_all(build_query: Callable[[], object]) -> list[dict]:
    """All rows of a query. `build_query` returns a fresh, ordered query builder on every call."""
    rows: list[dict] = []
    start = 0
    while True:
        page = build_query().range(start, start + PAGE_SIZE - 1).execute().data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE
