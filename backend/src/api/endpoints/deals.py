from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from src.services.keepa_service import keepa_service
from src.agents.deal_analyzer_agent import deal_analyzer
from src.agents.listing_generator_agent import listing_generator
from src.services.notification_service import notification_service
from src.core.database import supabase
import asyncio

router = APIRouter(prefix="/deals", tags=["Deals Orchestration"])

# We create a model to accept ASIN from the frontend
class ScanRequest(BaseModel):
    asin: str

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
        # Generate mock data dynamically based on the requested ASIN
        product_title = f"Test Product for ASIN: {asin}"
        current_price = 45.0
        historical_price = 99.0
        await asyncio.sleep(1)

    amazon_url = f"https://amazon.de/dp/{asin}"
    print(f"📦 Analyzing product: {product_title} | Current: €{current_price} | Historical: €{historical_price}")
    
    analysis = deal_analyzer.analyze_deal(
        product_title=product_title,
        current_price=current_price,
        average_historical_price=historical_price
    )
    
    print(f"🧠 AI Decision: Profitable? {analysis.is_profitable} | Margin: {analysis.estimated_profit_margin}%")

    if analysis.is_profitable:
        print("✍️ Generating Willhaben listing via AI...")
        listing_data = listing_generator.generate_willhaben_listing(
            product_title=product_title,
            product_category="General",
            bought_price=current_price,
            historical_price=historical_price
        )

        try:
            product_res = supabase.table("products").upsert({
                "asin": asin,
                "amazon_locale": "DE",
                "title": product_title,
                "category": "General"
            }, on_conflict="asin,amazon_locale").execute()
            
            product_id = product_res.data[0]["id"]

            opp_res = supabase.table("opportunities").insert({
                "product_id": product_id,
                "buy_price": current_price,
                "target_sell_price": listing_data.suggested_price,
                "profit_margin": analysis.estimated_profit_margin,
                "ai_decision": analysis.reasoning,
                "status": "pending"
            }).execute()

            opp_id = opp_res.data[0]["id"]

            supabase.table("generated_listings").insert({
                "opportunity_id": opp_id,
                "target_platform": "Willhaben",
                "language": "de",
                "generated_title": listing_data.title,
                "generated_description": listing_data.description
            }).execute()
            print("✅ Successfully saved to Supabase!")
        except Exception as e:
            print(f"❌ Supabase Error: {str(e)}")

        await notification_service.send_deal_alert(
            product_title=product_title,
            buy_price=current_price,
            profit_margin=analysis.estimated_profit_margin,
            amazon_url=amazon_url
        )
        
    print("🏁 Pipeline execution finished.")


@router.post("/scan")
async def trigger_deal_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    """
    Accepts an ASIN from the UI or n8n, and runs the scan in the background.
    """
    background_tasks.add_task(run_deal_scan_pipeline, request.asin)
    return {
        "status": "accepted", 
        "message": f"Deal scan pipeline started for {request.asin}."
    }