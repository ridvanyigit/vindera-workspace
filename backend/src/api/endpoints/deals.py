"""Deal orchestration endpoints.

The scan pipeline itself lives in `services/scan_pipeline.py`, the daily
inventory checks in `services/inventory_alerts.py`, the allowed status changes in
`services/lifecycle.py` and the money math in `services/profit_calculator.py`.
This module holds the HTTP endpoints: scan triggers, the opportunity lifecycle
(status, sale, return, soft delete) and manual entry.

Multi-table writes (manual entry, sale, return) go through the atomic RPC
functions of the database, so they either happen completely or not at all.
Endpoints that call the (synchronous) Supabase client are plain `def`, so FastAPI
runs them in its thread pool instead of blocking the event loop.
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from src.core.auth import AuthPrincipal, require_admin, require_admin_or_automation
from src.core.categories import FALLBACK_CATEGORY
from src.core.database import supabase
from src.core.rate_limit import SCAN_LIMIT, limiter
from src.core.validation import (
    Asin,
    DealScore,
    HttpsUrl,
    NonNegativeMoney,
    OpportunityStatus,
    PositiveMoney,
    ProductCondition,
    Score0to10,
    WillhabenUrl,
)
from src.services.business_settings import BusinessSettings, load_business_settings
from src.services.db_util import call_rpc
from src.services.inventory_alerts import run_inventory_alerts
from src.services.lifecycle import IllegalTransition, can_record_sale, check_transition, return_by_date
from src.services.profit_calculator import (
    ProfitResult,
    actual_profit,
    as_float,
    calculate,
    min_emergency_price,
    storable_margin,
)
from src.services.scan_pipeline import create_scan_job, run_deal_scan_pipeline

logger = logging.getLogger(__name__)

# Every route on `router` requires a logged-in admin. The scan triggers that n8n
# calls live on `automation_router`, which also accepts the shared secret.
# Both are mounted in main.py, which refuses to start if any /api/v1 route ends
# up without one of the two auth dependencies.
router = APIRouter(prefix="/deals", tags=["Deals Orchestration"], dependencies=[Depends(require_admin)])
automation_router = APIRouter(
    prefix="/deals", tags=["Deals Automation"], dependencies=[Depends(require_admin_or_automation)]
)

DEFAULT_WAREHOUSE_LOCATION = "A01"
AMAZON_LOCALE = "DE"

SCAN_LIST_LIMIT = 50


# --- Helpers ----------------------------------------------------------------

def _aware(value: datetime | None) -> datetime | None:
    """Timestamps sent without a zone are taken as UTC; nothing naive reaches the database."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _business_settings() -> BusinessSettings:
    try:
        return load_business_settings()
    except Exception:
        logger.exception("Could not load business_settings")
        raise HTTPException(status_code=503, detail="Could not load the business settings.")


def _get_open_row(opportunity_id: str) -> dict:
    """The (not soft-deleted) opportunity row, or 404."""
    try:
        res = supabase.table("opportunities").select("*").eq("id", opportunity_id).is_("deleted_at", "null").execute()
    except Exception:
        logger.exception("Could not load opportunity %s", opportunity_id)
        raise HTTPException(status_code=503, detail="The database is unavailable.")
    if not res.data:
        raise HTTPException(status_code=404, detail=f"Opportunity {opportunity_id} not found.")
    return res.data[0]


def _effective_price(row: dict) -> float:
    """What the unit really cost: the recorded purchase price, else the planned buy price."""
    actual = row.get("purchase_price_actual")
    return actual if actual is not None else row["buy_price"]


def _estimate(
    *, sell_price: float, purchase_price: float, inbound: float | None, packaging: float | None
) -> tuple[ProfitResult, float | None]:
    """Net estimate from the single profit engine, plus the default emergency price (None: no break-even)."""
    try:
        result = calculate(
            sell_price=sell_price,
            purchase_price=purchase_price,
            settings=_business_settings().profit,
            inbound_shipping=inbound,
            packaging=packaging,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return result, as_float(min_emergency_price(result.sell_price, result.break_even_price))


# --- Request models -------------------------------------------------------

class ScanRequest(BaseModel):
    asin: Asin


class StatusUpdateRequest(BaseModel):
    """Move a deal along its lifecycle and/or patch optional fields.

    `status` may be omitted to only patch fields. Fields listed as clearable are
    written whenever they are sent, including as null; the others ignore null.
    """

    status: OpportunityStatus | None = None

    # What "Mark as Bought" records (status -> bought needs the price).
    purchase_price_actual: PositiveMoney | None = None
    purchased_at: datetime | None = None
    order_ref: str | None = Field(default=None, max_length=100)
    inbound_shipping_cost: NonNegativeMoney | None = None
    packaging_cost: NonNegativeMoney | None = None

    product_condition: ProductCondition | None = None
    is_quarantine: bool | None = None
    target_sell_price: PositiveMoney | None = None
    purchase_thesis: str | None = Field(default=None, max_length=2000)

    # Public storefront: the live Willhaben listing the "Buy" button opens.
    willhaben_url: WillhabenUrl = None


class SaleRequest(BaseModel):
    amount: PositiveMoney
    shipping_cost: NonNegativeMoney = 0
    platform_fees: NonNegativeMoney = 0
    occurred_at: datetime | None = None
    note: str | None = Field(default=None, max_length=500)

    # Sale outcome (ML training data).
    customer_inquiries_count: int | None = Field(default=None, ge=0, le=10_000)
    customer_messages_summary: str | None = Field(default=None, max_length=2000)
    sold_during_event: str | None = Field(default=None, max_length=100)


class ReturnRequest(BaseModel):
    # Default: refund everything the customer still has paid.
    refund_amount: NonNegativeMoney | None = None
    return_shipping_cost: NonNegativeMoney = 0
    occurred_at: datetime | None = None
    note: str | None = Field(default=None, max_length=500)


# --- Endpoints ------------------------------------------------------------

@automation_router.post("/scan", status_code=202)
@limiter.limit(SCAN_LIMIT)
async def scan_asin(request: Request, payload: ScanRequest, background_tasks: BackgroundTasks):
    """Queue a deal scan for a single ASIN.

    Returns immediately with the `scan_jobs` id; the pipeline runs in the
    background and reports its outcome on that job (see `GET /deals/scans`).
    Used by the n8n daily batch workflow (automation key) and by the admin UI.
    """
    try:
        job_id = await create_scan_job(payload.asin)
    except Exception:
        logger.exception("Could not create scan job for %s", payload.asin)
        raise HTTPException(status_code=503, detail="Could not queue the scan: database unavailable.")

    background_tasks.add_task(run_deal_scan_pipeline, payload.asin, job_id)
    return {
        "status": "accepted",
        "asin": payload.asin,
        "job_id": job_id,
        "message": "Deal scan started in the background.",
    }


@automation_router.get("/watchlist")
def get_watchlist():
    """ASINs the daily n8n workflow scans (`watchlist_asins` where active)."""
    try:
        res = supabase.table("watchlist_asins").select("asin").eq("active", True).order("created_at").execute()
    except Exception:
        logger.exception("Could not load the watchlist")
        raise HTTPException(status_code=503, detail="Could not load the watchlist.")
    asins = [row["asin"] for row in res.data or []]
    return {"asins": asins, "count": len(asins)}


@router.get("/scans")
def list_scan_jobs():
    """The newest scan jobs, so failed scans are visible."""
    try:
        res = (
            supabase.table("scan_jobs")
            .select("id, asin, status, error, retry_after, opportunity_id, created_at, started_at, finished_at")
            .order("created_at", desc=True)
            .limit(SCAN_LIST_LIMIT)
            .execute()
        )
    except Exception:
        logger.exception("Could not load scan jobs")
        raise HTTPException(status_code=503, detail="Could not load scan jobs.")
    return {"jobs": res.data or []}



@automation_router.post("/dead-stock/scan", status_code=202)
async def scan_dead_stock(background_tasks: BackgroundTasks):
    """Queue the daily inventory checks (dead stock and Amazon return deadlines).

    Returns immediately; the checks run in the background. Called daily by the
    n8n workflow. Safe to call repeatedly: a unit is only ever announced once
    per kind of alert.
    """
    background_tasks.add_task(run_inventory_alerts)
    return {"status": "accepted", "message": "Inventory checks started in the background."}


# --- Lifecycle ----------------------------------------------------------------

# Written when sent, including as null (the UI clears a field by sending it empty).
_CLEARABLE_FIELDS = ("order_ref", "inbound_shipping_cost", "packaging_cost", "purchase_thesis", "willhaben_url")
# Null means "not sent" for these: the columns cannot be emptied.
_KEEP_WHEN_NULL_FIELDS = ("purchase_price_actual", "product_condition", "is_quarantine", "target_sell_price")
# Changing any of them changes the profit estimate.
_ESTIMATE_INPUTS = ("purchase_price_actual", "inbound_shipping_cost", "packaging_cost", "target_sell_price")


@router.patch("/{opportunity_id}/status")
def update_opportunity_status(opportunity_id: uuid.UUID, request: StatusUpdateRequest):
    """Advance an opportunity through its lifecycle and patch optional fields.

    The change must be allowed by `services/lifecycle.py` (otherwise 409).
    Moving to `bought` requires `purchase_price_actual` and records the purchase
    date and the Amazon return-by date; `in_inventory` stamps `received_at`;
    `listed` stamps `listed_at`. A sale is not a status change: use
    `POST /deals/{id}/sale`. The profit estimate is recomputed whenever a cost or
    the target price changes.
    """
    opportunity_id = str(opportunity_id)
    row = _get_open_row(opportunity_id)
    current = row["status"]
    target = request.status or current

    try:
        check_transition(current, target)
    except IllegalTransition as e:
        raise HTTPException(status_code=409, detail=str(e))

    fields = request.model_fields_set
    now = datetime.now(timezone.utc)
    changes: dict = {}

    if target != current:
        changes["status"] = target
        if target == "bought":
            if request.purchase_price_actual is None:
                raise HTTPException(status_code=422, detail="purchase_price_actual is required to mark a deal as bought.")
            if request.purchased_at is None:
                changes["purchased_at"] = now.isoformat()
                changes["return_by"] = return_by_date(now, _business_settings().return_window_days).isoformat()
        elif target == "in_inventory" and not row.get("received_at"):
            changes["received_at"] = now.isoformat()
        elif target == "listed":
            changes["listed_at"] = now.isoformat()

    for name in _CLEARABLE_FIELDS:
        if name in fields:
            value = getattr(request, name)
            changes[name] = (value.strip() or None) if isinstance(value, str) and name == "order_ref" else value
    for name in _KEEP_WHEN_NULL_FIELDS:
        if getattr(request, name) is not None:
            changes[name] = getattr(request, name)

    purchased_at = _aware(request.purchased_at)
    if purchased_at is not None:
        changes["purchased_at"] = purchased_at.isoformat()
        changes["return_by"] = return_by_date(purchased_at, _business_settings().return_window_days).isoformat()

    if any(name in changes for name in _ESTIMATE_INPUTS):
        merged = {**row, **changes}
        if merged.get("target_sell_price"):
            estimate, _ = _estimate(
                sell_price=merged["target_sell_price"],
                purchase_price=_effective_price(merged),
                inbound=merged.get("inbound_shipping_cost"),
                packaging=merged.get("packaging_cost"),
            )
            margin = storable_margin(estimate.net_margin_pct)
            changes.update(
                net_profit_estimate=as_float(estimate.net_profit), net_margin_estimate=margin, profit_margin=margin
            )
            # The emergency price may never sit below break-even (below cost).
            if estimate.break_even_price is not None:
                floor = as_float(min_emergency_price(estimate.sell_price, estimate.break_even_price))
                if row.get("emergency_sell_price") is None or row["emergency_sell_price"] < as_float(
                    estimate.break_even_price
                ):
                    changes["emergency_sell_price"] = floor

    if not changes:
        return {"status": "success", "data": row}

    # Compare-and-set on the status the transition was checked against, so two
    # requests racing each other cannot both apply.
    try:
        res = (
            supabase.table("opportunities")
            .update(changes)
            .eq("id", opportunity_id)
            .eq("status", current)
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        logger.exception("Status update of %s failed", opportunity_id)
        raise HTTPException(status_code=500, detail="The database rejected the change.")

    if not res.data:
        raise HTTPException(status_code=409, detail="The deal was changed in the meantime. Reload and try again.")

    return {"status": "success", "data": res.data[0]}


@router.post("/{opportunity_id}/sale")
def record_sale(opportunity_id: uuid.UUID, request: SaleRequest, principal: AuthPrincipal = Depends(require_admin)):
    """Record the sale of one unit (ledger event) and mark it sold.

    The profit is computed here from the recorded purchase cost and the shipping
    and fees entered with the sale; a profit sent by a client is not accepted.
    """
    opportunity_id = str(opportunity_id)
    row = _get_open_row(opportunity_id)
    if not can_record_sale(row["status"]):
        raise HTTPException(status_code=409, detail=f'A deal in status "{row["status"]}" cannot be sold.')

    outcome = actual_profit(
        sale_amount=request.amount,
        purchase_price=_effective_price(row),
        inbound_shipping=row.get("inbound_shipping_cost"),
        packaging=row.get("packaging_cost"),
        shipping_cost=request.shipping_cost,
        platform_fees=request.platform_fees,
    )
    occurred_at = _aware(request.occurred_at)
    payload = {
        "amount": request.amount,
        "shipping_cost": request.shipping_cost,
        "platform_fees": request.platform_fees,
        "occurred_at": occurred_at.isoformat() if occurred_at else None,
        "note": request.note,
        "actual_profit": as_float(outcome.net_profit),
        "customer_inquiries_count": request.customer_inquiries_count,
        "customer_messages_summary": request.customer_messages_summary,
        "sold_during_event": request.sold_during_event,
        "actor": principal.user_id,
    }
    result = call_rpc("record_sale", {"p_id": opportunity_id, "payload": {k: v for k, v in payload.items() if v is not None}})

    logger.info("Sale recorded for opportunity %s", opportunity_id)
    return {
        "status": "success",
        **result,
        "actual_profit": as_float(outcome.net_profit),
        "net_margin_pct": as_float(outcome.net_margin_pct),
        "total_cost": as_float(outcome.total_cost),
    }


@router.post("/{opportunity_id}/return")
def record_return(opportunity_id: uuid.UUID, request: ReturnRequest, principal: AuthPrincipal = Depends(require_admin)):
    """A customer sent a sold unit back: write the refund and put the unit back into stock.

    The sale stays in the ledger and the target price is kept. The unit returns
    to `in_inventory` in quarantine ("REVIEW NEEDED") until it is checked and
    re-priced on purpose.
    """
    opportunity_id = str(opportunity_id)
    occurred_at = _aware(request.occurred_at)
    payload = {
        "refund_amount": request.refund_amount,
        "return_shipping_cost": request.return_shipping_cost,
        "occurred_at": occurred_at.isoformat() if occurred_at else None,
        "note": request.note,
        "actor": principal.user_id,
    }
    result = call_rpc("record_return", {"p_id": opportunity_id, "payload": {k: v for k, v in payload.items() if v is not None}})

    logger.info("Return recorded for opportunity %s", opportunity_id)
    return {"status": "success", **result}


@router.delete("/{opportunity_id}")
def delete_opportunity(opportunity_id: uuid.UUID):
    """Soft-delete an opportunity (`deleted_at`); nothing is removed from the database.

    Refused (409) for a unit that has been sold or has any sale event: those are
    bookkeeping records that must be kept. Use `written_off` for such a unit once
    it is back in stock. The product row is never deleted.
    """
    opportunity_id = str(opportunity_id)
    row = _get_open_row(opportunity_id)

    try:
        events = supabase.table("sale_events").select("id").eq("opportunity_id", opportunity_id).limit(1).execute()
    except Exception:
        logger.exception("Could not check sale events of %s", opportunity_id)
        raise HTTPException(status_code=503, detail="The database is unavailable.")
    if row["status"] == "sold" or events.data:
        raise HTTPException(
            status_code=409,
            detail="This deal has a recorded sale and is kept for bookkeeping. If it is back in stock, mark it as written off instead.",
        )

    try:
        res = (
            supabase.table("opportunities")
            .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", opportunity_id)
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        logger.exception("Soft delete of %s failed", opportunity_id)
        raise HTTPException(status_code=500, detail="The database rejected the change.")
    if not res.data:
        raise HTTPException(status_code=404, detail=f"Opportunity {opportunity_id} not found.")

    logger.info("Opportunity %s deleted (soft)", opportunity_id)
    return {"status": "success", "deleted_id": opportunity_id}


# --- Manual entry ---------------------------------------------------------
# The frontend cannot write directly: RLS grants `authenticated` SELECT only
# (plus UPDATE of the invoice columns on opportunities). Manual deals are
# therefore persisted here, through the atomic RPC functions, mirroring exactly
# what the scan pipeline writes, minus Keepa and OpenAI.

class ManualScoreBreakdown(BaseModel):
    discount: Score0to10 = 5
    demand: Score0to10 = 5
    competition: Score0to10 = 5
    capital_efficiency: Score0to10 = 5
    storage_size: Score0to10 = 5
    risk_level: Score0to10 = 5
    seasonality: Score0to10 = 5


class ManualDealRequest(BaseModel):
    # Product
    asin: Asin
    title: str = Field(min_length=1, max_length=300)
    category: str = Field(default=FALLBACK_CATEGORY, min_length=1, max_length=100)
    image_url: HttpsUrl = None
    # Extra photos for the storefront's product detail gallery, beyond the cover image.
    gallery_image_urls: list[HttpsUrl] = Field(default_factory=list, max_length=20)

    # Pricing
    buy_price: PositiveMoney
    target_sell_price: PositiveMoney
    emergency_sell_price: PositiveMoney | None = None
    willhaben_realistic_price: PositiveMoney | None = None
    # Public storefront: the live Willhaben listing the "Buy" button opens.
    willhaben_url: WillhabenUrl = None

    # Optional Amazon reference points. When both are supplied they are written
    # to price_history so the workspace chart shows a real slope instead of the
    # deterministic sample curve.
    amazon_price_today: PositiveMoney | None = None
    amazon_price_90d_avg: PositiveMoney | None = None

    # Lifecycle
    status: OpportunityStatus = "pending"
    product_condition: ProductCondition = "NEW"
    warehouse_location: str = Field(default=DEFAULT_WAREHOUSE_LOCATION, min_length=1, max_length=20)
    is_quarantine: bool = False
    sku: str | None = Field(default=None, max_length=50)
    # Create only: that many identical units, each with its own SKU.
    quantity: int = Field(default=1, ge=1, le=50)

    # Purchase record. On update, only the fields that are sent are changed.
    purchase_price_actual: PositiveMoney | None = None
    purchased_at: datetime | None = None
    order_ref: str | None = Field(default=None, max_length=100)
    inbound_shipping_cost: NonNegativeMoney | None = None
    packaging_cost: NonNegativeMoney | None = None
    received_at: datetime | None = None
    listed_at: datetime | None = None

    # Market context
    buybox_seller: str = Field(default="Manual", min_length=1, max_length=100)
    buybox_is_fba: bool = False

    # Analysis (normally produced by DealAnalyzerAgent)
    deal_score: DealScore = 85
    holding_period_months: int = Field(default=2, ge=0, le=60)
    ai_decision: str | None = Field(default=None, max_length=5000)
    purchase_thesis: str | None = Field(default=None, max_length=2000)
    seasonality_analysis: str | None = Field(default=None, max_length=2000)
    score_breakdown: ManualScoreBreakdown = ManualScoreBreakdown()

    # Willhaben listing
    listing_title: str = Field(min_length=1, max_length=200)
    listing_description: str = Field(min_length=1, max_length=8000)

    # Sale outcome (ML training data) - only meaningful when status == 'sold'.
    # The profit is computed here; a client-supplied profit is not accepted.
    actual_sell_price: NonNegativeMoney | None = None
    shipping_and_prep_cost: NonNegativeMoney | None = None
    platform_fees: NonNegativeMoney | None = None
    customer_inquiries_count: int | None = Field(default=None, ge=0, le=10_000)
    customer_messages_summary: str | None = Field(default=None, max_length=2000)
    sold_during_event: str | None = Field(default=None, max_length=100)
    time_to_sell_days: int | None = Field(default=None, ge=0, le=3650)


# Columns written only when the client actually sent them (`update_manual_deal`
# keeps the stored value for an absent key).
_PURCHASE_FIELDS = (
    "purchase_price_actual",
    "purchased_at",
    "order_ref",
    "inbound_shipping_cost",
    "packaging_cost",
    "received_at",
    "listed_at",
)


def _manual_payload(request: ManualDealRequest, principal: AuthPrincipal, existing: dict | None = None) -> dict:
    """RPC payload for a manual deal, with every derived figure computed by the backend.

    `existing` is the stored row on update: purchase values the form did not send
    are taken from it, so the profit estimate matches what is really stored.
    """
    fields = request.model_fields_set
    data = request.model_dump(mode="json", exclude={"quantity"} if existing else set())
    for name in _PURCHASE_FIELDS:
        if name not in fields:
            data.pop(name)

    def value(name: str):
        if name in fields:
            return getattr(request, name)
        return existing.get(name) if existing else None

    purchase_price = value("purchase_price_actual") or request.buy_price
    inbound, packaging = value("inbound_shipping_cost"), value("packaging_cost")

    estimate, default_emergency = _estimate(
        sell_price=request.target_sell_price, purchase_price=purchase_price, inbound=inbound, packaging=packaging
    )
    margin = storable_margin(estimate.net_margin_pct)
    data.update(
        profit_margin=margin,
        net_profit_estimate=as_float(estimate.net_profit),
        net_margin_estimate=margin,
        emergency_sell_price=request.emergency_sell_price or default_emergency,
    )

    purchased_at = _aware(request.purchased_at)
    if "purchased_at" in fields:
        data["purchased_at"] = purchased_at.isoformat() if purchased_at else None
        data["return_by"] = (
            return_by_date(purchased_at, _business_settings().return_window_days).isoformat() if purchased_at else None
        )
    for name in ("received_at", "listed_at"):
        if name in data and data[name] is not None:
            data[name] = _aware(getattr(request, name)).isoformat()

    if request.status == "sold" and request.actual_sell_price is not None:
        outcome = actual_profit(
            sale_amount=request.actual_sell_price,
            purchase_price=purchase_price,
            inbound_shipping=inbound,
            packaging=packaging,
            shipping_cost=request.shipping_and_prep_cost,
            platform_fees=request.platform_fees,
        )
        data["actual_profit"] = as_float(outcome.net_profit)

    if principal.user_id:
        data["actor"] = principal.user_id
    return data


@router.post("/manual", status_code=201)
def create_manual_deal(request: ManualDealRequest, principal: AuthPrincipal = Depends(require_admin)):
    """Create one or more complete opportunities from hand-entered data.

    One RPC call writes `products` -> `opportunities` -> `generated_listings`
    (and the ledger entry for a deal entered as sold) in one transaction, so the
    workspace, product master and reports render the deal exactly as if the scan
    pipeline had produced it. No Keepa or OpenAI calls are made.
    """
    payload = _manual_payload(request, principal)
    result = call_rpc("create_manual_deal", {"payload": payload})

    logger.info("Manual deal saved for ASIN %s (%d unit(s), status %s)", request.asin, request.quantity, request.status)
    return {
        "status": "success",
        **result,
        "opportunity_id": result["opportunity_ids"][0],
        "sku": result["skus"][0],
        "profit_margin": payload["profit_margin"],
        "net_profit_estimate": payload["net_profit_estimate"],
    }


@router.put("/{opportunity_id}/manual")
def update_manual_deal(
    opportunity_id: uuid.UUID, request: ManualDealRequest, principal: AuthPrincipal = Depends(require_admin)
):
    """Replace every editable field of an existing opportunity (PUT semantics).

    Updates the linked `products` row, the `opportunities` row and its
    `generated_listings` row in one transaction. A sold deal cannot be moved back
    or have its recorded sale amounts changed here (use the return endpoint).

    Price history is only touched when BOTH Amazon reference prices are
    supplied: in that case the product's existing history is replaced by the
    two new data points. Leave them empty to keep the stored history intact.
    """
    opportunity_id = str(opportunity_id)
    existing = _get_open_row(opportunity_id)
    payload = _manual_payload(request, principal, existing)
    result = call_rpc("update_manual_deal", {"p_id": opportunity_id, "payload": payload})

    logger.info("Manual deal updated for ASIN %s (status %s)", request.asin, request.status)
    return {"status": "success", **result, "profit_margin": payload["profit_margin"]}
