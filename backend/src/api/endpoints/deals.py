from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from src.services.keepa_service import keepa_service
from src.agents.deal_analyzer_agent import deal_analyzer
from src.agents.listing_generator_agent import listing_generator
from src.services.notification_service import notification_service
from src.core.database import supabase
import asyncio
from datetime import datetime, timedelta
import random
import uuid

router = APIRouter(prefix="/deals", tags=["Deals Orchestration"])

class ScanRequest(BaseModel):
    asin: str

class StatusUpdateRequest(BaseModel):
    status: str
    product_condition: str | None = None
    is_quarantine: bool | None = None
    target_sell_price: float | None = None

async def run_deal_scan_pipeline(asin: str):
    print(f"🚀 Starting Amazon Deal Scan Pipeline for ASIN: {asin}...")

    raw_keepa_data = await keepa_service.fetch_product_data(asin=asin)

    if raw_keepa_data:
        price_info = keepa_service.extract_price_info(raw_keepa_data)
        product_title = price_info["title"]
        current_price = price_info["current_price"]
        historical_price = price_info["average_historical_price"]
    else:
        print("⚠️ Using Mock Data (Keepa API key missing or failed).")
        product_title = f"Test Product for ASIN: {asin}"
        current_price = 45.0
        historical_price = 99.0

    await asyncio.sleep(1)

    amazon_url = f"https://amazon.de/dp/{asin}"

    # === SIMULATED BUYBOX DATA ===
    mock_sellers = [
        {"seller": "Amazon", "is_fba": True},
        {"seller": "MediaMarkt AT", "is_fba": True},
        {"seller": "TechShenzhen_Direct", "is_fba": False} # High risk example
    ]

    chosen_seller = random.choice(mock_sellers)
    buybox_seller = chosen_seller["seller"]
    buybox_is_fba = chosen_seller["is_fba"]

    # ==============================

    # === FETCH UPCOMING EVENTS (NEXT 90 DAYS) ===
    event_limit_date = (datetime.now() + timedelta(days=90)).date().isoformat()
    current_date = datetime.now().date().isoformat()

    events_res = supabase.table("events_calendar")\
        .select("event_name, event_date")\
        .gte("event_date", current_date)\
        .lte("event_date", event_limit_date).execute()

    events_context = "No major events in the next 90 days."

    if events_res.data:
        events_context = ", ".join([f"{e['event_name']} on {e['event_date']}" for e in events_res.data])

    # ============================================

    analysis = deal_analyzer.analyze_deal(
        product_title=product_title, 
        product_category="Technology & Electronics",
        current_price=current_price, 
        average_historical_price=historical_price,
        buybox_seller=buybox_seller, 
        is_fba=buybox_is_fba,
        upcoming_events=events_context # Pass events to AI
    )

    analysis = deal_analyzer.analyze_deal(
        product_title=product_title, 
        product_category="Technology & Electronics", # Şimdilik mock kategori
        current_price=current_price, 
        average_historical_price=historical_price,
        buybox_seller=buybox_seller, 
        is_fba=buybox_is_fba
    )

    if analysis.is_profitable:

        listing_data = listing_generator.generate_willhaben_listing(
            product_title=product_title, product_category="Technology & Electronics", bought_price=current_price, historical_price=historical_price
        )

        # PHASE 12: EXPERT "NO-BUY" GUARDRAILS
        expected_profit_euro = listing_data.suggested_price - current_price
        final_status = "pending"
        
        # Strict Rule: Reject if ROI/Margin is < 25% OR raw profit is < €15
        if analysis.estimated_profit_margin < 25 or expected_profit_euro < 15:
            final_status = "rejected"
            print(f"🚫 DEAL REJECTED: Failed No-Buy rules (Margin: {analysis.estimated_profit_margin}%, Profit: €{expected_profit_euro:.2f})")

        try:
            product_res = supabase.table("products").upsert({
                "asin": asin, "amazon_locale": "DE", "title": product_title, "category": "Technology & Electronics"
            }, on_conflict="asin,amazon_locale").execute()
            
            product_id = product_res.data[0]["id"]

            history_data = []
            base_date = datetime.now()
            for i in range(5, -1, -1):
                fake_price = historical_price if i > 0 else current_price
                history_data.append({ "product_id": product_id, "price_amazon": fake_price, "recorded_at": (base_date - timedelta(days=i)).isoformat() })
            supabase.table("price_history").insert(history_data).execute()

            generated_sku = f"GEN-{str(uuid.uuid4())[:6].upper()}"
            emergency_price = round(listing_data.suggested_price * 0.85, 2)

            # Insert with dynamic final_status (pending or rejected)
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
                "sku": generated_sku,
                "emergency_sell_price": emergency_price,
                "warehouse_location": "A01", 
                "product_condition": "NEW",
                "score_breakdown": analysis.breakdown.model_dump(),
                "willhaben_realistic_price": analysis.willhaben_realistic_price,
                "purchase_thesis": analysis.purchase_thesis
            }).execute()

            opp_id = opp_res.data[0]["id"]

            supabase.table("generated_listings").insert({
                "opportunity_id": opp_id, "target_platform": "Willhaben", "language": "de",
                "generated_title": listing_data.generated_title, "generated_description": listing_data.generated_description
            }).execute()
            
            print(f"✅ Successfully saved to Supabase (Status: {final_status})!")
        except Exception as e:
            print(f"❌ Supabase Error: {str(e)}")

        # Send push notification ONLY if the deal score is exceptionally high (>= 80) AND not rejected
        if analysis.deal_score >= 80 and final_status != "rejected":
            print(f"🔥 HOT DEAL ({analysis.deal_score}%)! Sending push notification to iPhone...")
            await notification_service.send_deal_alert(
                product_title=product_title, 
                buy_price=current_price, 
                profit_margin=analysis.estimated_profit_margin, 
                amazon_url=amazon_url
            )
        else:
            if final_status == "rejected":
                print("🔕 No notification sent because deal was rejected by No-Buy Guardrails.")
            else:
                print(f"ℹ️ Deal score is {analysis.deal_score}%. No push notification sent (must be >= 80).")

    print("🏁 Pipeline execution finished.")

@router.post("/scan")
async def trigger_deal_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(run_deal_scan_pipeline, request.asin)
    return {"status": "accepted", "message": f"Scan started for {request.asin}."}

@router.patch("/{opportunity_id}/status")
async def update_opportunity_status(opportunity_id: str, request: StatusUpdateRequest):
    try:
        # Build dynamic update payload
        payload = {"status": request.status}
        
        # Phase 15: Record exact sell time for velocity metrics
        if request.status == "sold":
            from datetime import datetime
            payload["sold_at"] = datetime.now().isoformat()
            
        if request.product_condition is not None:
            payload["product_condition"] = request.product_condition
        if request.is_quarantine is not None:
            payload["is_quarantine"] = request.is_quarantine
        if request.target_sell_price is not None:
            payload["target_sell_price"] = request.target_sell_price

        res = supabase.table("opportunities").update(payload).eq("id", opportunity_id).execute()
        return {"status": "success", "data": res.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
