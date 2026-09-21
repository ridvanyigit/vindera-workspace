"""Loads the single `business_settings` row (the owner's numbers) with a short cache."""

import logging
import time
from dataclasses import dataclass

from src.core.database import supabase
from src.services.profit_calculator import ProfitSettings

logger = logging.getLogger(__name__)

CACHE_SECONDS = 60

# Same wording as the migration default; used only when the row is missing.
DEFAULT_PAYMENT_TEXT = "Barzahlung bei Abholung oder Banküberweisung im Voraus."


@dataclass(frozen=True)
class BusinessSettings:
    profit: ProfitSettings
    listing_legal_footer: str = ""
    listing_payment_text: str = DEFAULT_PAYMENT_TEXT
    return_window_days: int = 30


_cache: tuple[float, BusinessSettings] | None = None


def load_business_settings(force: bool = False) -> BusinessSettings:
    """Blocking (supabase-py is synchronous): call from async code via `asyncio.to_thread`.

    A database error propagates, so a scan fails visibly instead of running on
    guessed numbers. Only a MISSING row falls back to the built-in defaults.
    """
    global _cache
    if not force and _cache is not None and time.monotonic() - _cache[0] < CACHE_SECONDS:
        return _cache[1]

    res = supabase.table("business_settings").select("*").eq("id", 1).limit(1).execute()
    if res.data:
        row = res.data[0]
        loaded = BusinessSettings(
            profit=ProfitSettings.from_row(row),
            listing_legal_footer=row.get("listing_legal_footer") or "",
            listing_payment_text=(row.get("listing_payment_text") or "").strip() or DEFAULT_PAYMENT_TEXT,
            return_window_days=int(row.get("return_window_days") or 30),
        )
    else:
        logger.warning("business_settings row is missing; using built-in defaults")
        loaded = BusinessSettings(profit=ProfitSettings())

    _cache = (time.monotonic(), loaded)
    return loaded
