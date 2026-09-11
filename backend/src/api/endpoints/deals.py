from fastapi import APIRouter, BackgroundTasks
from src.services.keepa_service import keepa_service
from src.agents.deal_analyzer_agent import deal_analyzer
from src.agents.listing_generator_agent import listing_generator
from src.services.notification_service import notification_service
from src.core.database import supabase
import asyncio
import uuid

router = APIRouter(prefix="/deals", tags=["Deals Orchestration"])

async def run_deal_scan_pipeline(asin: str = "B09Y2MYL5C"):
    """
    Core pipeline: Keepa -> AI Analyzer -> AI Listing -> Supabase -> Notification.
    """
    print(f"🚀 Starting Amazon Deal Scan Pipeline for ASIN: {asin}...")
    
    # 1. Fetch data from Keepa
    raw_keepa_data = await keepa_service.fetch_product_data(asin=asin)
    
    # Check if we got data (If no Keepa Key, use mock data for testing)
    if raw_keepa_data:
        price_info = keepa_service.extract_price_info(raw_keepa_data)
        product_title = price_info["title"]
        current_price = price_info["current_price"]
        historical_price = price_info["average_historical_price"]
    else:
        print("⚠️ Using Mock Data (Keepa API key missing or failed).")
        product_title = "Sony WH-1000XM5 Wireless Headphones"
        current_price = 199.0
        historical_price = 349.0
        await asyncio.sleep(1) # Simulate delay

    amazon_url = f"https://amazon.de/dp/{asin}"
    print(f"📦 Analyzing product: {product_title} | Current: €{current_price} | Historical: €{historical_price}")
    
    # 2. Ask AI if this is a good deal
    analysis = deal_analyzer.analyze_deal(
        product_title=product_title,
        current_price=current_price,
        average_historical_price=historical_price
    )
    
    print(f"🧠 AI Decision: Profitable? {analysis.is_profitable} | Margin: {analysis.estimated_profit_margin}%")

    # 3. If profitable, generate listing, save to DB, and notify
    if analysis.is_profitable:
        print("✍️ Generating Willhaben listing via AI...")
        listing_data = listing_generator.generate_willhaben_listing(
            product_title=product_title,
            product_category="Electronics",
            bought_price=current_price,
            historical_price=historical_price
        )

        print("💾 Saving Opportunity to Supabase...")
        try:
            # First, ensure product exists in products table
            product_res = supabase.table("products").upsert({
                "asin": asin,
                "amazon_locale": "DE",
                "title": product_title,
                "category": "Electronics"
            }, on_conflict="asin,amazon_locale").execute()
            
            product_id = product_res.data[0]["id"]

            # Save to opportunities table
            opp_res = supabase.table("opportunities").insert({
                "product_id": product_id,
                "buy_price": current_price,
                "target_sell_price": listing_data.suggested_price,
                "profit_margin": analysis.estimated_profit_margin,
                "ai_decision": analysis.reasoning,
                "status": "pending"
            }).execute()

            opp_id = opp_res.data[0]["id"]

            # Save generated listing
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

        # Send Push Notification
        await notification_service.send_deal_alert(
            product_title=product_title,
            buy_price=current_price,
            profit_margin=analysis.estimated_profit_margin,
            amazon_url=amazon_url
        )
        
    print("🏁 Pipeline execution finished.")


@router.post("/scan")
async def trigger_deal_scan(background_tasks: BackgroundTasks):
    # For now, we hardcode an ASIN to test the flow. Later, n8n will provide a list of ASINs.
    test_asin = "B09Y2MYL5C" 
    background_tasks.add_task(run_deal_scan_pipeline, test_asin)
    return {
        "status": "accepted", 
        "message": f"Deal scan pipeline started for {test_asin}."
    }