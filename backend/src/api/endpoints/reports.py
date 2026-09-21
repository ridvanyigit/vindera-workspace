"""Reports for the owner and the Steuerberater.

`GET /reports/summary` returns the calendar-year figures computed by the
`report_summary` database function (management view and cash / Einnahmen-Ausgaben
view, see migration 20260921091200). `GET /reports/export.csv` lists the single
bookings behind them. All aggregation happens in the database; anything that
lists rows is read in pages, so no total depends on PostgREST's 1000-row cap.
"""

import csv
import io
import logging
from datetime import date, datetime, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Response

from src.core.auth import require_admin
from src.core.database import supabase
from src.services.db_util import call_rpc, fetch_all

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["Reports"], dependencies=[Depends(require_admin)])

VIENNA = ZoneInfo("Europe/Vienna")

Year = Annotated[int, Query(ge=2000, le=2100)]

# A unit counts as bought in these statuses (a cancelled order never cost money).
PURCHASED_STATUSES = ("bought", "in_inventory", "listed", "sold", "written_off")

CSV_HEADER = ["Datum", "Art", "Beleg (SKU)", "ASIN", "Beschreibung", "Einnahmen EUR", "Ausgaben EUR", "Hinweis"]


def _current_year() -> int:
    return datetime.now(VIENNA).year


def _local_date(value: str) -> date:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(VIENNA).date()


def _text(value: object) -> str:
    """Cell text that a spreadsheet cannot interpret as a formula."""
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


def _amount(value: float | None, decimal_comma: bool) -> str:
    if not value:
        return ""
    text = f"{value:.2f}"
    return text.replace(".", ",") if decimal_comma else text


@router.get("/summary")
def report_summary(year: Year = None):
    """Figures for one calendar year (Vienna time). Defaults to the current year."""
    return call_rpc("report_summary", {"p_year": year or _current_year()})


@router.get("/export.csv")
def export_csv(year: Year = None, decimal_comma: bool = False):
    """Every booking of the year as one chronological list (sales, refunds, purchases, expenses).

    UTF-8 with BOM and `;` as delimiter, so Excel opens it directly. With
    `decimal_comma=true` amounts use a comma ("12,50"), the German convention.
    """
    year = year or _current_year()
    start, end = date(year, 1, 1), date(year + 1, 1, 1)
    window_from = datetime(year, 1, 1, tzinfo=VIENNA).astimezone(timezone.utc).isoformat()
    window_to = datetime(year + 1, 1, 1, tzinfo=VIENNA).astimezone(timezone.utc).isoformat()

    events = fetch_all(
        lambda: supabase.table("sale_events")
        .select("occurred_at, event_type, amount, shipping_cost, platform_fees, note, opportunities(sku, products(asin, title))")
        .gte("occurred_at", window_from)
        .lt("occurred_at", window_to)
        .order("occurred_at")
        .order("id")
    )
    purchased = fetch_all(
        lambda: supabase.table("opportunities")
        .select(
            "sku, order_ref, buy_price, purchase_price_actual, inbound_shipping_cost, packaging_cost, "
            "purchased_at, received_at, created_at, products(asin, title)"
        )
        .in_("status", list(PURCHASED_STATUSES))
        .is_("deleted_at", "null")
        .order("created_at")
        .order("id")
    )
    expenses = fetch_all(
        lambda: supabase.table("business_expenses")
        .select("incurred_at, description, category, amount")
        .gte("incurred_at", start.isoformat())
        .lt("incurred_at", end.isoformat())
        .order("incurred_at")
        .order("id")
    )

    rows: list[tuple[date, list[str]]] = []

    def add(day: date, kind: str, sku: str, asin: str, description: str, income: float | None, outgo: float | None, note: str = ""):
        rows.append((day, [
            day.isoformat(), kind, _text(sku), _text(asin), _text(description),
            _amount(income, decimal_comma), _amount(outgo, decimal_comma), _text(note),
        ]))

    for event in events:
        opportunity = event.get("opportunities") or {}
        product = opportunity.get("products") or {}
        day = _local_date(event["occurred_at"])
        sku, asin, title = opportunity.get("sku") or "", product.get("asin") or "", product.get("title") or ""
        is_sale = event["event_type"] == "sale"
        add(day, "Verkauf" if is_sale else "Rückerstattung", sku, asin, title, event["amount"], None, event.get("note") or "")
        if event.get("shipping_cost"):
            add(day, "Versandkosten", sku, asin, title, None, event["shipping_cost"])
        if event.get("platform_fees"):
            add(day, "Plattformgebühren", sku, asin, title, None, event["platform_fees"])

    for unit in purchased:
        recorded = unit.get("purchased_at")
        basis = recorded or unit.get("received_at") or unit["created_at"]
        day = _local_date(basis)
        if not start <= day < end:
            continue
        price = unit["purchase_price_actual"] if unit.get("purchase_price_actual") is not None else unit["buy_price"]
        cost = price + (unit.get("inbound_shipping_cost") or 0) + (unit.get("packaging_cost") or 0)
        product = unit.get("products") or {}
        note = "Bestellung: " + unit["order_ref"] if unit.get("order_ref") else ""
        if not recorded:
            note = (note + "; " if note else "") + "Kaufdatum geschätzt"
        add(day, "Einkauf", unit.get("sku") or "", product.get("asin") or "", product.get("title") or "", None, round(cost, 2), note)

    for expense in expenses:
        add(date.fromisoformat(expense["incurred_at"]), "Ausgabe", "", "", f'{expense["category"]}: {expense["description"]}', None, expense["amount"])

    rows.sort(key=lambda item: item[0])

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(CSV_HEADER)
    writer.writerows(cells for _, cells in rows)

    return Response(
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="vindera-buchungen-{year}.csv"'},
    )
