"""Deal orchestration endpoints.

The scan pipeline itself lives in `services/scan_pipeline.py`; this module holds
the HTTP endpoints, the dead-stock check and the opportunity lifecycle updates.
Endpoints that call the (synchronous) Supabase client are plain `def`, so FastAPI
runs them in its thread pool instead of blocking the event loop.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from src.core.auth import require_admin, require_admin_or_automation
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
from src.services.business_settings import load_business_settings
from src.services.notification_service import notification_service
from src.services.profit_calculator import ProfitResult, as_float, calculate, min_emergency_price, storable_margin
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

# Dead stock: an open item older than this many days has tied up capital too
# long. Mirrors the "Dead Stock Alert" banner in frontend/src/app/admin/page.tsx
# (age = full days since `created_at`, alert when > 60).
DEAD_STOCK_DAYS = 60
DEAD_STOCK_STATUSES = ("bought", "in_inventory", "listed")

DEFAULT_WAREHOUSE_LOCATION = "A01"
AMAZON_LOCALE = "DE"

SCAN_LIST_LIMIT = 50


# --- Helpers ----------------------------------------------------------------

def _days_since_start(row: dict, now: datetime) -> int | None:
    """Full days from the start of holding a unit: listing, else purchase, else scan date."""
    for key in ("listed_at", "purchased_at", "created_at"):
        if row.get(key):
            started = datetime.fromisoformat(row[key].replace("Z", "+00:00"))
            return max((now - started).days, 0)
    return None


def _manual_profit(buy_price: float, target_sell_price: float) -> tuple[ProfitResult, float]:
    """Net profit for a hand-entered deal from the single profit engine, plus the emergency price."""
    try:
        result = calculate(
            sell_price=target_sell_price, purchase_price=buy_price, settings=load_business_settings().profit
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return result, as_float(min_emergency_price(result.sell_price, result.break_even_price))


# --- Request models -------------------------------------------------------

class ScanRequest(BaseModel):
    asin: Asin


class StatusUpdateRequest(BaseModel):
    status: OpportunityStatus
    product_condition: ProductCondition | None = None
    is_quarantine: bool | None = None
    target_sell_price: PositiveMoney | None = None
    purchase_thesis: str | None = Field(default=None, max_length=2000)

    # Sale outcome (ML training data) — sent when status moves to 'sold'.
    actual_sell_price: NonNegativeMoney | None = None
    actual_profit: float | None = Field(default=None, ge=-100_000, le=100_000)
    shipping_and_prep_cost: NonNegativeMoney | None = None
    platform_fees: NonNegativeMoney | None = None
    customer_inquiries_count: int | None = Field(default=None, ge=0, le=10_000)
    customer_messages_summary: str | None = Field(default=None, max_length=2000)
    sold_during_event: str | None = Field(default=None, max_length=100)

    # Public storefront: the live Willhaben listing the "Buy" button opens.
    # Blank clears it (see `update_opportunity_status`).
    willhaben_url: WillhabenUrl = None


async def run_dead_stock_scan():
    """Push one digest for items that newly crossed the dead-stock threshold.

    `dead_stock_notified_at` is stamped only after Pushover accepts the message,
    so an item is announced once, and retried on the next run if the push
    could not be delivered.
    """
    logger.info("Starting dead-stock scan")
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=DEAD_STOCK_DAYS)).isoformat()

    try:
        res = await asyncio.to_thread(
            lambda: supabase.table("opportunities")
            .select("id, buy_price, created_at, products(title)")
            .in_("status", list(DEAD_STOCK_STATUSES))
            .is_("dead_stock_notified_at", "null")
            .lt("created_at", cutoff)
            .execute()
        )
    except Exception:
        logger.exception("Dead-stock query failed")
        return

    items = []
    for row in res.data or []:
        created_at = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        age_days = (now - created_at).days
        # The query returns items at least 60 days old; the UI banner needs more than 60 full days.
        if age_days <= DEAD_STOCK_DAYS:
            continue
        items.append({
            "id": row["id"],
            "title": (row.get("products") or {}).get("title") or "Untitled item",
            "buy_price": row["buy_price"],
            "age_days": age_days,
        })

    if not items:
        logger.info("Dead-stock scan finished (nothing new)")
        return

    items.sort(key=lambda item: item["age_days"], reverse=True)

    delivered = await notification_service.send_dead_stock_alert(items, DEAD_STOCK_DAYS)
    if not delivered:
        logger.warning("Dead-stock push not delivered; items stay un-notified and will be retried")
        return

    try:
        await asyncio.to_thread(
            lambda: supabase.table("opportunities")
            .update({"dead_stock_notified_at": now.isoformat()})
            .in_("id", [item["id"] for item in items])
            .execute()
        )
    except Exception:
        logger.exception("Could not stamp dead_stock_notified_at (items will be re-announced)")
        return

    logger.info("Dead-stock scan finished (%d item(s) announced)", len(items))


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
    """Queue a dead-stock check.

    Returns immediately; the scan runs in the background. Called daily by the
    n8n workflow. Safe to call repeatedly: an item is only ever announced once
    (`dead_stock_notified_at`).
    """
    background_tasks.add_task(run_dead_stock_scan)
    return {"status": "accepted", "message": "Dead-stock scan started in the background."}


@router.patch("/{opportunity_id}/status")
def update_opportunity_status(opportunity_id: uuid.UUID, request: StatusUpdateRequest):
    """Advance an opportunity through its lifecycle and patch optional fields.

    When the status moves to 'sold', also stamps `time_to_sell_days` (measured
    from `listed_at`, else `purchased_at`, else `created_at`) so the sale outcome
    fields form a complete row for future ML training, alongside whatever
    actual_* fields the sale-confirm modal sent. Phase 4 moves the sale itself to
    `POST /deals/{id}/sale`.
    """
    opportunity_id = str(opportunity_id)
    payload: dict = {"status": request.status}

    if request.status == "sold":
        now = datetime.now(timezone.utc)
        payload["sold_at"] = now.isoformat()

        basis_res = (
            supabase.table("opportunities")
            .select("listed_at, purchased_at, created_at")
            .eq("id", opportunity_id)
            .execute()
        )
        days = _days_since_start(basis_res.data[0], now) if basis_res.data else None
        if days is not None:
            payload["time_to_sell_days"] = days

    optional_fields = {
        "product_condition": request.product_condition,
        "is_quarantine": request.is_quarantine,
        "target_sell_price": request.target_sell_price,
        "purchase_thesis": request.purchase_thesis,
        "actual_sell_price": request.actual_sell_price,
        "actual_profit": request.actual_profit,
        "shipping_and_prep_cost": request.shipping_and_prep_cost,
        "platform_fees": request.platform_fees,
        "customer_inquiries_count": request.customer_inquiries_count,
        "customer_messages_summary": request.customer_messages_summary,
        "sold_during_event": request.sold_during_event,
    }
    payload.update({key: value for key, value in optional_fields.items() if value is not None})

    # The Willhaben link is the one field the UI needs to clear again, so it is
    # written whenever it was sent, including as null.
    if "willhaben_url" in request.model_fields_set:
        payload["willhaben_url"] = request.willhaben_url

    try:
        res = supabase.table("opportunities").update(payload).eq("id", opportunity_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not res.data:
        raise HTTPException(status_code=404, detail=f"Opportunity {opportunity_id} not found.")

    return {"status": "success", "data": res.data[0]}


# --- Manual entry ---------------------------------------------------------
# The frontend cannot write directly: RLS grants `authenticated` SELECT only
# (plus UPDATE on opportunities for invoice attachment). Manual deals are
# therefore persisted here, through the service role, mirroring exactly what
# `run_deal_scan_pipeline` writes — minus Keepa and OpenAI.

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

    # Sale outcome (ML training data) — only meaningful when status == 'sold'.
    actual_sell_price: NonNegativeMoney | None = None
    actual_profit: float | None = Field(default=None, ge=-100_000, le=100_000)
    shipping_and_prep_cost: NonNegativeMoney | None = None
    platform_fees: NonNegativeMoney | None = None
    customer_inquiries_count: int | None = Field(default=None, ge=0, le=10_000)
    customer_messages_summary: str | None = Field(default=None, max_length=2000)
    sold_during_event: str | None = Field(default=None, max_length=100)
    time_to_sell_days: int | None = Field(default=None, ge=0, le=3650)


def _sale_outcome_fields(request: "ManualDealRequest") -> dict:
    """Extract the ML-training sale outcome fields that were actually filled in."""
    fields = {
        "actual_sell_price": request.actual_sell_price,
        "actual_profit": request.actual_profit,
        "shipping_and_prep_cost": request.shipping_and_prep_cost,
        "platform_fees": request.platform_fees,
        "customer_inquiries_count": request.customer_inquiries_count,
        "customer_messages_summary": request.customer_messages_summary,
        "sold_during_event": request.sold_during_event,
        "time_to_sell_days": request.time_to_sell_days,
    }
    return {key: value for key, value in fields.items() if value is not None}


@router.post("/manual", status_code=201)
def create_manual_deal(request: ManualDealRequest):
    """Create a complete opportunity from hand-entered data.

    Writes `products` -> `opportunities` -> `generated_listings` in one call so
    the workspace, product master and reports all render the deal exactly as if
    the scan pipeline had produced it. No Keepa or OpenAI calls are made.
    """
    asin = request.asin

    # Recomputed server-side by the profit engine so the stored figures always match the prices.
    profit, default_emergency = _manual_profit(request.buy_price, request.target_sell_price)
    profit_margin = storable_margin(profit.net_margin_pct)
    emergency_price = request.emergency_sell_price or default_emergency
    sku = (request.sku or "").strip() or f"GEN-{str(uuid.uuid4())[:6].upper()}"

    try:
        product_payload = {
            "asin": asin,
            "amazon_locale": AMAZON_LOCALE,
            "title": request.title.strip(),
            "category": request.category,
        }
        if request.image_url:
            product_payload["image_url"] = request.image_url
        product_payload["gallery_image_urls"] = [u for u in request.gallery_image_urls if u]

        product_res = supabase.table("products").upsert(
            product_payload, on_conflict="asin,amazon_locale"
        ).execute()
        product_id = product_res.data[0]["id"]

        # Two honest data points, when supplied: Amazon's price today and its
        # 90-day average dated 90 days back. Nothing is invented in between, and
        # the workspace chart prefers these over its sample curve.
        if request.amazon_price_today and request.amazon_price_90d_avg:
            now = datetime.now(timezone.utc)
            supabase.table("price_history").insert([
                {
                    "product_id": product_id,
                    "price_amazon": request.amazon_price_90d_avg,
                    "recorded_at": (now - timedelta(days=90)).isoformat(),
                },
                {
                    "product_id": product_id,
                    "price_amazon": request.amazon_price_today,
                    "recorded_at": now.isoformat(),
                    "is_deal": request.amazon_price_today < request.amazon_price_90d_avg,
                },
            ]).execute()

        opp_payload = {
            "product_id": product_id,
            "buy_price": request.buy_price,
            "target_sell_price": request.target_sell_price,
            "emergency_sell_price": emergency_price,
            "willhaben_realistic_price": request.willhaben_realistic_price or request.target_sell_price,
            "willhaben_url": request.willhaben_url,
            "profit_margin": profit_margin,
            "net_profit_estimate": as_float(profit.net_profit),
            "net_margin_estimate": profit_margin,
            "ai_decision": request.ai_decision or "Manually entered deal. No automated analysis was performed.",
            "status": request.status,
            "buybox_seller": request.buybox_seller,
            "buybox_is_fba": request.buybox_is_fba,
            "deal_score": request.deal_score,
            "holding_period_months": request.holding_period_months,
            "seasonality_analysis": request.seasonality_analysis,
            "sku": sku,
            "warehouse_location": request.warehouse_location,
            "product_condition": request.product_condition,
            "is_quarantine": request.is_quarantine,
            "score_breakdown": request.score_breakdown.model_dump(),
            "purchase_thesis": request.purchase_thesis,
        }

        if request.status == "sold":
            opp_payload["sold_at"] = datetime.now(timezone.utc).isoformat()
            opp_payload.update(_sale_outcome_fields(request))

        opp_res = supabase.table("opportunities").insert(opp_payload).execute()
        opportunity_id = opp_res.data[0]["id"]

        supabase.table("generated_listings").insert({
            "opportunity_id": opportunity_id,
            "target_platform": "Willhaben",
            "language": "de",
            "generated_title": request.listing_title.strip(),
            "generated_description": request.listing_description.strip(),
        }).execute()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Manual deal creation failed")
        raise HTTPException(status_code=500, detail=str(e))

    logger.info("Manual deal saved for ASIN %s (SKU %s, status %s)", asin, sku, request.status)
    return {
        "status": "success",
        "opportunity_id": opportunity_id,
        "product_id": product_id,
        "sku": sku,
        "profit_margin": profit_margin,
    }


@router.put("/{opportunity_id}/manual")
def update_manual_deal(opportunity_id: uuid.UUID, request: ManualDealRequest):
    """Replace every editable field of an existing opportunity.

    Updates the linked `products` row, the `opportunities` row and its
    `generated_listings` row in one call. `sold_at` is stamped when the deal
    moves into `sold` and cleared when it moves back out.

    Price history is only touched when BOTH Amazon reference prices are
    supplied: in that case the product's existing history is replaced by the
    two new data points. Leave them empty to keep the stored history intact.
    """
    asin = request.asin

    existing_res = supabase.table("opportunities").select(
        "id, product_id, sold_at"
    ).eq("id", opportunity_id).execute()

    if not existing_res.data:
        raise HTTPException(status_code=404, detail=f"Opportunity {opportunity_id} not found.")

    existing = existing_res.data[0]
    product_id = existing["product_id"]

    profit, default_emergency = _manual_profit(request.buy_price, request.target_sell_price)
    profit_margin = storable_margin(profit.net_margin_pct)
    emergency_price = request.emergency_sell_price or default_emergency
    sku = (request.sku or "").strip() or f"GEN-{str(uuid.uuid4())[:6].upper()}"

    try:
        product_payload = {
            "asin": asin,
            "amazon_locale": AMAZON_LOCALE,
            "title": request.title.strip(),
            "category": request.category,
            "image_url": request.image_url,
            "gallery_image_urls": [u for u in request.gallery_image_urls if u],
        }
        supabase.table("products").update(product_payload).eq("id", product_id).execute()

        if request.amazon_price_today and request.amazon_price_90d_avg:
            now = datetime.now(timezone.utc)
            supabase.table("price_history").delete().eq("product_id", product_id).execute()
            supabase.table("price_history").insert([
                {
                    "product_id": product_id,
                    "price_amazon": request.amazon_price_90d_avg,
                    "recorded_at": (now - timedelta(days=90)).isoformat(),
                },
                {
                    "product_id": product_id,
                    "price_amazon": request.amazon_price_today,
                    "recorded_at": now.isoformat(),
                    "is_deal": request.amazon_price_today < request.amazon_price_90d_avg,
                },
            ]).execute()

        opp_payload = {
            "buy_price": request.buy_price,
            "target_sell_price": request.target_sell_price,
            "emergency_sell_price": emergency_price,
            "willhaben_realistic_price": request.willhaben_realistic_price or request.target_sell_price,
            "willhaben_url": request.willhaben_url,
            "profit_margin": profit_margin,
            "net_profit_estimate": as_float(profit.net_profit),
            "net_margin_estimate": profit_margin,
            "ai_decision": request.ai_decision or "Manually entered deal. No automated analysis was performed.",
            "status": request.status,
            "buybox_seller": request.buybox_seller,
            "buybox_is_fba": request.buybox_is_fba,
            "deal_score": request.deal_score,
            "holding_period_months": request.holding_period_months,
            "seasonality_analysis": request.seasonality_analysis,
            "sku": sku,
            "warehouse_location": request.warehouse_location,
            "product_condition": request.product_condition,
            "is_quarantine": request.is_quarantine,
            "score_breakdown": request.score_breakdown.model_dump(),
            "purchase_thesis": request.purchase_thesis,
        }

        if request.status == "sold":
            opp_payload["sold_at"] = existing.get("sold_at") or datetime.now(timezone.utc).isoformat()
            opp_payload.update(_sale_outcome_fields(request))
        else:
            opp_payload["sold_at"] = None

        supabase.table("opportunities").update(opp_payload).eq("id", opportunity_id).execute()

        listing_payload = {
            "generated_title": request.listing_title.strip(),
            "generated_description": request.listing_description.strip(),
        }
        listing_res = supabase.table("generated_listings").select("id").eq(
            "opportunity_id", opportunity_id
        ).execute()

        if listing_res.data:
            supabase.table("generated_listings").update(listing_payload).eq(
                "id", listing_res.data[0]["id"]
            ).execute()
        else:
            supabase.table("generated_listings").insert({
                **listing_payload,
                "opportunity_id": opportunity_id,
                "target_platform": "Willhaben",
                "language": "de",
            }).execute()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Manual deal update failed")
        raise HTTPException(status_code=500, detail=str(e))

    logger.info("Manual deal updated for ASIN %s (SKU %s, status %s)", asin, sku, request.status)
    return {
        "status": "success",
        "opportunity_id": opportunity_id,
        "product_id": product_id,
        "sku": sku,
        "profit_margin": profit_margin,
    }


@router.delete("/{opportunity_id}")
def delete_opportunity(opportunity_id: uuid.UUID):
    """Delete one opportunity and its generated listing (cascade).

    The `products` row is intentionally kept: it carries the price history and
    can be reused if the same ASIN is entered again. Products with no remaining
    opportunities are invisible in the UI.
    """
    try:
        res = supabase.table("opportunities").delete().eq("id", opportunity_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not res.data:
        raise HTTPException(status_code=404, detail=f"Opportunity {opportunity_id} not found.")

    logger.info("Opportunity %s deleted", opportunity_id)
    return {"status": "success", "deleted_id": opportunity_id}
