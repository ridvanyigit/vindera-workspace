"""Deal orchestration endpoints.

Owns the end-to-end scan pipeline (Keepa -> AI analysis -> guardrails ->
persistence -> notification) and the opportunity lifecycle status updates.
"""

import asyncio
import random
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from src.agents.deal_analyzer_agent import deal_analyzer
from src.agents.listing_generator_agent import listing_generator
from src.core.categories import FALLBACK_CATEGORY
from src.core.database import supabase
from src.services.keepa_service import keepa_service
from src.services.notification_service import notification_service

router = APIRouter(prefix="/deals", tags=["Deals Orchestration"])

# --- Business rules -------------------------------------------------------
# "No-Buy" guardrails: a deal is rejected unless it clears BOTH thresholds.
MIN_PROFIT_MARGIN_PCT = 25
MIN_PROFIT_EUR = 15

# Push notifications are reserved for exceptional deals only.
HOT_DEAL_SCORE_THRESHOLD = 80

# Liquidation price used when inventory has to be cleared quickly.
EMERGENCY_PRICE_RATIO = 0.85

DEFAULT_WAREHOUSE_LOCATION = "A01"
AMAZON_LOCALE = "DE"
EVENT_LOOKAHEAD_DAYS = 90

# Mock values used when no Keepa API key is configured.
MOCK_CURRENT_PRICE = 45.0
MOCK_HISTORICAL_PRICE = 99.0


# --- Request models -------------------------------------------------------

class ScanRequest(BaseModel):
    asin: str


class StatusUpdateRequest(BaseModel):
    status: str
    product_condition: str | None = None
    is_quarantine: bool | None = None
    target_sell_price: float | None = None
    purchase_thesis: str | None = None

    # Sale outcome (ML training data) — sent when status moves to 'sold'.
    actual_sell_price: float | None = None
    actual_profit: float | None = None
    shipping_and_prep_cost: float | None = None
    platform_fees: float | None = None
    customer_inquiries_count: int | None = None
    customer_messages_summary: str | None = None
    sold_during_event: str | None = None


# --- Pipeline helpers -----------------------------------------------------

def _fetch_upcoming_events() -> str:
    """Summarize the next 90 days of calendar events as AI prompt context."""
    today = datetime.now().date()
    horizon = (today + timedelta(days=EVENT_LOOKAHEAD_DAYS)).isoformat()

    try:
        events_res = (
            supabase.table("events_calendar")
            .select("event_name, event_date")
            .gte("event_date", today.isoformat())
            .lte("event_date", horizon)
            .execute()
        )
    except Exception as e:
        print(f"⚠️ Could not load events_calendar: {str(e)}")
        return "No major events in the next 90 days."

    if not events_res.data:
        return "No major events in the next 90 days."

    return ", ".join(f"{e['event_name']} on {e['event_date']}" for e in events_res.data)


def _pick_mock_buybox() -> tuple[str, bool]:
    """Simulate BuyBox ownership.

    TODO: replace with real Keepa merchant data once live credits are active.
    """
    mock_sellers = [
        {"seller": "Amazon", "is_fba": True},
        {"seller": "MediaMarkt AT", "is_fba": True},
        {"seller": "TechShenzhen_Direct", "is_fba": False},  # High risk example
    ]
    chosen = random.choice(mock_sellers)
    return chosen["seller"], chosen["is_fba"]


def _build_price_history(product_id: str, current_price: float, historical_price: float) -> list[dict]:
    """Seed six days of price history.

    TODO: replace with Keepa's real daily CSV history once live data is available.
    """
    base_date = datetime.now()
    return [
        {
            "product_id": product_id,
            "price_amazon": historical_price if days_ago > 0 else current_price,
            "recorded_at": (base_date - timedelta(days=days_ago)).isoformat(),
        }
        for days_ago in range(5, -1, -1)
    ]


# --- Pipeline -------------------------------------------------------------

async def run_deal_scan_pipeline(asin: str):
    """Scan a single ASIN and persist the resulting opportunity."""
    print(f"🚀 Starting Amazon Deal Scan Pipeline for ASIN: {asin}...")

    # 1. Pricing data (Keepa, or mock values when no key is configured)
    raw_keepa_data = await keepa_service.fetch_product_data(asin=asin)

    if raw_keepa_data:
        price_info = keepa_service.extract_price_info(raw_keepa_data)
        product_title = price_info["title"]
        product_category = price_info["category"]
        current_price = price_info["current_price"]
        historical_price = price_info["average_historical_price"]
    else:
        print("⚠️ Using Mock Data (Keepa API key missing or failed).")
        product_title = f"Test Product for ASIN: {asin}"
        product_category = FALLBACK_CATEGORY
        current_price = MOCK_CURRENT_PRICE
        historical_price = MOCK_HISTORICAL_PRICE

    await asyncio.sleep(1)

    amazon_url = f"https://amazon.de/dp/{asin}"
    buybox_seller, buybox_is_fba = _pick_mock_buybox()
    events_context = _fetch_upcoming_events()

    # 2. AI acquisition scorecard
    analysis = deal_analyzer.analyze_deal(
        product_title=product_title,
        product_category=product_category,
        current_price=current_price,
        average_historical_price=historical_price,
        buybox_seller=buybox_seller,
        is_fba=buybox_is_fba,
        upcoming_events=events_context,
    )

    if not analysis.is_profitable:
        print("🏁 Pipeline execution finished (deal not profitable).")
        return

    # 3. Willhaben listing copy and suggested price
    listing_data = listing_generator.generate_willhaben_listing(
        product_title=product_title,
        product_category=product_category,
        bought_price=current_price,
        historical_price=historical_price,
    )

    # 4. "No-Buy" guardrails
    expected_profit_euro = listing_data.suggested_price - current_price
    final_status = "pending"

    if analysis.estimated_profit_margin < MIN_PROFIT_MARGIN_PCT or expected_profit_euro < MIN_PROFIT_EUR:
        final_status = "rejected"
        print(
            f"🚫 DEAL REJECTED: Failed No-Buy rules "
            f"(Margin: {analysis.estimated_profit_margin}%, Profit: €{expected_profit_euro:.2f})"
        )

    # 5. Persistence
    try:
        product_res = supabase.table("products").upsert(
            {
                "asin": asin,
                "amazon_locale": AMAZON_LOCALE,
                "title": product_title,
                "category": product_category,
            },
            on_conflict="asin,amazon_locale",
        ).execute()

        product_id = product_res.data[0]["id"]

        supabase.table("price_history").insert(
            _build_price_history(product_id, current_price, historical_price)
        ).execute()

        opp_res = supabase.table("opportunities").insert({
            "product_id": product_id,
            "buy_price": current_price,
            "target_sell_price": listing_data.suggested_price,
            "profit_margin": analysis.estimated_profit_margin,
            "ai_decision": analysis.reasoning,
            "status": final_status,
            "buybox_seller": buybox_seller,
            "buybox_is_fba": buybox_is_fba,
            "deal_score": analysis.deal_score,
            "holding_period_months": analysis.holding_period_months,
            "seasonality_analysis": analysis.seasonality_analysis,
            "sku": f"GEN-{str(uuid.uuid4())[:6].upper()}",
            "emergency_sell_price": round(listing_data.suggested_price * EMERGENCY_PRICE_RATIO, 2),
            "warehouse_location": DEFAULT_WAREHOUSE_LOCATION,
            "product_condition": "NEW",
            "score_breakdown": analysis.breakdown.model_dump(),
            "willhaben_realistic_price": analysis.willhaben_realistic_price,
            "purchase_thesis": analysis.purchase_thesis,
        }).execute()

        supabase.table("generated_listings").insert({
            "opportunity_id": opp_res.data[0]["id"],
            "target_platform": "Willhaben",
            "language": "de",
            "generated_title": listing_data.generated_title,
            "generated_description": listing_data.generated_description,
        }).execute()

        print(f"✅ Successfully saved to Supabase (Status: {final_status})!")
    except Exception as e:
        print(f"❌ Supabase Error: {str(e)}")

    # 6. Push notification for exceptional deals only
    if final_status == "rejected":
        print("🔕 No notification sent because deal was rejected by No-Buy Guardrails.")
    elif analysis.deal_score >= HOT_DEAL_SCORE_THRESHOLD:
        print(f"🔥 HOT DEAL ({analysis.deal_score}%)! Sending push notification to iPhone...")
        await notification_service.send_deal_alert(
            product_title=product_title,
            buy_price=current_price,
            profit_margin=analysis.estimated_profit_margin,
            amazon_url=amazon_url,
        )
    else:
        print(
            f"ℹ️ Deal score is {analysis.deal_score}%. No push notification sent "
            f"(must be >= {HOT_DEAL_SCORE_THRESHOLD})."
        )

    print("🏁 Pipeline execution finished.")


# --- Endpoints ------------------------------------------------------------

@router.post("/scan", status_code=202)
async def scan_asin(request: ScanRequest, background_tasks: BackgroundTasks):
    """Queue a deal scan for a single ASIN.

    Returns immediately; the pipeline runs in the background. Used by the n8n
    daily batch workflow and by any external trigger.
    """
    asin = request.asin.strip().upper()

    if not asin:
        raise HTTPException(status_code=422, detail="ASIN must not be empty.")

    background_tasks.add_task(run_deal_scan_pipeline, asin)
    return {"status": "accepted", "asin": asin, "message": "Deal scan started in the background."}


@router.patch("/{opportunity_id}/status")
async def update_opportunity_status(opportunity_id: str, request: StatusUpdateRequest):
    """Advance an opportunity through its lifecycle and patch optional fields.

    When the status moves to 'sold', also stamps `time_to_sell_days` (measured
    against `created_at`) so the sale outcome fields form a complete row for
    future ML training, alongside whatever actual_* fields the sale-confirm
    modal sent.
    """
    payload: dict = {"status": request.status}

    if request.status == "sold":
        now = datetime.now()
        payload["sold_at"] = now.isoformat()

        created_res = (
            supabase.table("opportunities").select("created_at").eq("id", opportunity_id).execute()
        )
        if created_res.data and created_res.data[0].get("created_at"):
            created_at = datetime.fromisoformat(created_res.data[0]["created_at"].replace("Z", "+00:00"))
            now_ref = datetime.now(created_at.tzinfo) if created_at.tzinfo else now
            payload["time_to_sell_days"] = max((now_ref - created_at).days, 0)

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
    discount: int = 5
    demand: int = 5
    competition: int = 5
    capital_efficiency: int = 5
    storage_size: int = 5
    risk_level: int = 5
    seasonality: int = 5


class ManualDealRequest(BaseModel):
    # Product
    asin: str
    title: str
    category: str = FALLBACK_CATEGORY
    image_url: str | None = None

    # Pricing
    buy_price: float
    target_sell_price: float
    emergency_sell_price: float | None = None
    willhaben_realistic_price: float | None = None

    # Optional Amazon reference points. When both are supplied they are written
    # to price_history so the workspace chart shows a real slope instead of the
    # deterministic sample curve.
    amazon_price_today: float | None = None
    amazon_price_90d_avg: float | None = None

    # Lifecycle
    status: str = "pending"
    product_condition: str = "NEW"
    warehouse_location: str = DEFAULT_WAREHOUSE_LOCATION
    is_quarantine: bool = False
    sku: str | None = None

    # Market context
    buybox_seller: str = "Manual"
    buybox_is_fba: bool = False

    # Analysis (normally produced by DealAnalyzerAgent)
    deal_score: int = 85
    holding_period_months: int = 2
    ai_decision: str | None = None
    purchase_thesis: str | None = None
    seasonality_analysis: str | None = None
    score_breakdown: ManualScoreBreakdown = ManualScoreBreakdown()

    # Willhaben listing
    listing_title: str
    listing_description: str

    # Sale outcome (ML training data) — only meaningful when status == 'sold'.
    actual_sell_price: float | None = None
    actual_profit: float | None = None
    shipping_and_prep_cost: float | None = None
    platform_fees: float | None = None
    customer_inquiries_count: int | None = None
    customer_messages_summary: str | None = None
    sold_during_event: str | None = None
    time_to_sell_days: int | None = None


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
async def create_manual_deal(request: ManualDealRequest):
    """Create a complete opportunity from hand-entered data.

    Writes `products` -> `opportunities` -> `generated_listings` in one call so
    the workspace, product master and reports all render the deal exactly as if
    the scan pipeline had produced it. No Keepa or OpenAI calls are made.
    """
    asin = request.asin.strip().upper()

    if not asin:
        raise HTTPException(status_code=422, detail="ASIN must not be empty.")
    if request.buy_price <= 0 or request.target_sell_price <= 0:
        raise HTTPException(status_code=422, detail="Prices must be greater than zero.")

    # Recomputed server-side so the stored margin always matches the prices.
    profit_margin = round(((request.target_sell_price - request.buy_price) / request.buy_price) * 100, 2)
    emergency_price = request.emergency_sell_price or round(request.target_sell_price * EMERGENCY_PRICE_RATIO, 2)
    sku = (request.sku or "").strip() or f"GEN-{str(uuid.uuid4())[:6].upper()}"

    try:
        product_payload = {
            "asin": asin,
            "amazon_locale": AMAZON_LOCALE,
            "title": request.title.strip(),
            "category": request.category,
        }
        if request.image_url:
            product_payload["image_url"] = request.image_url.strip()

        product_res = supabase.table("products").upsert(
            product_payload, on_conflict="asin,amazon_locale"
        ).execute()
        product_id = product_res.data[0]["id"]

        # Two honest data points, when supplied: Amazon's price today and its
        # 90-day average dated 90 days back. Nothing is invented in between, and
        # the workspace chart prefers these over its sample curve.
        if request.amazon_price_today and request.amazon_price_90d_avg:
            now = datetime.now()
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
            "profit_margin": profit_margin,
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
            opp_payload["sold_at"] = datetime.now().isoformat()
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
        print(f"❌ Manual deal error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

    print(f"✅ Manual deal saved for ASIN {asin} (SKU {sku}, status {request.status}).")
    return {
        "status": "success",
        "opportunity_id": opportunity_id,
        "product_id": product_id,
        "sku": sku,
        "profit_margin": profit_margin,
    }


@router.put("/{opportunity_id}/manual")
async def update_manual_deal(opportunity_id: str, request: ManualDealRequest):
    """Replace every editable field of an existing opportunity.

    Updates the linked `products` row, the `opportunities` row and its
    `generated_listings` row in one call. `sold_at` is stamped when the deal
    moves into `sold` and cleared when it moves back out.

    Price history is only touched when BOTH Amazon reference prices are
    supplied: in that case the product's existing history is replaced by the
    two new data points. Leave them empty to keep the stored history intact.
    """
    asin = request.asin.strip().upper()

    if not asin:
        raise HTTPException(status_code=422, detail="ASIN must not be empty.")
    if request.buy_price <= 0 or request.target_sell_price <= 0:
        raise HTTPException(status_code=422, detail="Prices must be greater than zero.")

    existing_res = supabase.table("opportunities").select(
        "id, product_id, sold_at"
    ).eq("id", opportunity_id).execute()

    if not existing_res.data:
        raise HTTPException(status_code=404, detail=f"Opportunity {opportunity_id} not found.")

    existing = existing_res.data[0]
    product_id = existing["product_id"]

    profit_margin = round(((request.target_sell_price - request.buy_price) / request.buy_price) * 100, 2)
    emergency_price = request.emergency_sell_price or round(request.target_sell_price * EMERGENCY_PRICE_RATIO, 2)
    sku = (request.sku or "").strip() or f"GEN-{str(uuid.uuid4())[:6].upper()}"

    try:
        product_payload = {
            "asin": asin,
            "amazon_locale": AMAZON_LOCALE,
            "title": request.title.strip(),
            "category": request.category,
            "image_url": request.image_url.strip() if request.image_url else None,
        }
        supabase.table("products").update(product_payload).eq("id", product_id).execute()

        if request.amazon_price_today and request.amazon_price_90d_avg:
            now = datetime.now()
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
            "profit_margin": profit_margin,
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
            opp_payload["sold_at"] = existing.get("sold_at") or datetime.now().isoformat()
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
        print(f"❌ Manual deal update error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

    print(f"✏️ Manual deal updated for ASIN {asin} (SKU {sku}, status {request.status}).")
    return {
        "status": "success",
        "opportunity_id": opportunity_id,
        "product_id": product_id,
        "sku": sku,
        "profit_margin": profit_margin,
    }


@router.delete("/{opportunity_id}")
async def delete_opportunity(opportunity_id: str):
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

    print(f"🗑️ Opportunity {opportunity_id} deleted.")
    return {"status": "success", "deleted_id": opportunity_id}
