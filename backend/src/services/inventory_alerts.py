"""Daily inventory checks, called by the n8n workflow (POST /deals/dead-stock/scan).

    dead stock       an open unit held for more than DEAD_STOCK_DAYS days
    return deadline  an open unit whose Amazon return window closes within
                     RETURN_ALERT_DAYS days (send it back if it is not selling)

Each unit is announced once (`dead_stock_notified_at`, `return_alert_notified_at`),
and stamped only after Pushover accepted the message, so a failed push is retried
on the next run. Soft-deleted units are never considered.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from src.core.database import supabase
from src.services.db_util import fetch_all
from src.services.lifecycle import HELD_STATUSES
from src.services.notification_service import notification_service

logger = logging.getLogger(__name__)

# Mirrors the "Dead Stock Alert" banner in frontend/src/app/admin/page.tsx:
# age = full days since receipt (else purchase, else scan), alert when > 60.
DEAD_STOCK_DAYS = 60
RETURN_ALERT_DAYS = 5


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def holding_days(row: dict, now: datetime) -> int | None:
    """Full days a unit has been held: since it arrived, else was bought, else was scanned."""
    for key in ("received_at", "purchased_at", "created_at"):
        if row.get(key):
            return max((now - _parse(row[key])).days, 0)
    return None


def _title(row: dict) -> str:
    return (row.get("products") or {}).get("title") or "Untitled item"


def _stamp(column: str, ids: list[str], now: datetime) -> None:
    supabase.table("opportunities").update({column: now.isoformat()}).in_("id", ids).execute()


async def run_dead_stock_scan() -> None:
    """Push one digest for units that newly crossed the dead-stock threshold."""
    logger.info("Starting dead-stock scan")
    now = datetime.now(timezone.utc)

    try:
        rows = await asyncio.to_thread(
            fetch_all,
            lambda: supabase.table("opportunities")
            .select("id, buy_price, purchase_price_actual, received_at, purchased_at, created_at, products(title)")
            .in_("status", list(HELD_STATUSES))
            .is_("dead_stock_notified_at", "null")
            .is_("deleted_at", "null")
            .order("created_at"),
        )
    except Exception:
        logger.exception("Dead-stock query failed")
        return

    items = []
    for row in rows:
        age_days = holding_days(row, now)
        # The UI banner needs more than 60 full days.
        if age_days is None or age_days <= DEAD_STOCK_DAYS:
            continue
        items.append({
            "id": row["id"],
            "title": _title(row),
            "buy_price": row.get("purchase_price_actual") or row["buy_price"],
            "age_days": age_days,
        })

    if not items:
        logger.info("Dead-stock scan finished (nothing new)")
        return

    items.sort(key=lambda item: item["age_days"], reverse=True)

    if not await notification_service.send_dead_stock_alert(items, DEAD_STOCK_DAYS):
        logger.warning("Dead-stock push not delivered; items stay un-notified and will be retried")
        return

    try:
        await asyncio.to_thread(_stamp, "dead_stock_notified_at", [item["id"] for item in items], now)
    except Exception:
        logger.exception("Could not stamp dead_stock_notified_at (items will be re-announced)")
        return

    logger.info("Dead-stock scan finished (%d item(s) announced)", len(items))


async def run_return_window_scan() -> None:
    """Push one digest for units whose Amazon return window closes within RETURN_ALERT_DAYS days."""
    logger.info("Starting return-window scan")
    now = datetime.now(timezone.utc)
    today = now.date()
    horizon = today + timedelta(days=RETURN_ALERT_DAYS)

    try:
        rows = await asyncio.to_thread(
            fetch_all,
            lambda: supabase.table("opportunities")
            .select("id, return_by, products(title)")
            .in_("status", list(HELD_STATUSES))
            .is_("return_alert_notified_at", "null")
            .is_("deleted_at", "null")
            .gte("return_by", today.isoformat())
            .lte("return_by", horizon.isoformat())
            .order("return_by"),
        )
    except Exception:
        logger.exception("Return-window query failed")
        return

    if not rows:
        logger.info("Return-window scan finished (nothing due)")
        return

    items = [
        {
            "id": row["id"],
            "title": _title(row),
            "return_by": row["return_by"],
            "days_left": (date.fromisoformat(row["return_by"]) - today).days,
        }
        for row in rows
    ]

    if not await notification_service.send_return_deadline_alert(items):
        logger.warning("Return-deadline push not delivered; items stay un-notified and will be retried")
        return

    try:
        await asyncio.to_thread(_stamp, "return_alert_notified_at", [item["id"] for item in items], now)
    except Exception:
        logger.exception("Could not stamp return_alert_notified_at (items will be re-announced)")
        return

    logger.info("Return-window scan finished (%d item(s) announced)", len(items))


async def run_inventory_alerts() -> None:
    """Both daily checks; one failing must not stop the other."""
    for check in (run_dead_stock_scan, run_return_window_scan):
        try:
            await check()
        except Exception:
            logger.exception("%s failed", check.__name__)
