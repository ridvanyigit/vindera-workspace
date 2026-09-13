from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from src.services.keepa_service import keepa_service
from src.agents.deal_analyzer_agent import deal_analyzer
from src.agents.listing_generator_agent import listing_generator
from src.services.notification_service import notification_service
from src.core.database import supabase
import asyncio
from datetime import datetime, timedelta

router = APIRouter(prefix="/deals", tags=["Deals Orchestration"])

class ScanRequest(BaseModel):
    asin: str

class StatusUpdateRequest(BaseModel):
    status: str

async def run_deal_scan_pipeline(asin: str):
    print(f"🚀 Starting Scan for ASIN: {asin}...")
    
    raw_keepa_data = await keepa_service.fetch_product_data(asin=asin)
    if raw_keepa_data:
        price_info = keepa_service.extract_price_info(raw_keepa_data)
        product_title = price_info["title"]
        current_price = price_info["current_price"]
        historical_price = price_info["average_historical_price"]
    else:
        product_title = f"Test Product for ASIN: {asin}"
        current_price = 45.0
        historical_price = 99.0
        await asyncio.sleep(1)

    amazon_url = f"https://amazon.de/dp/{asin}"
    analysis = deal_analyzer.analyze_deal(product_title=product_title, current_price=current_price, average_historical_price=historical_price)
    
    if analysis.is_profitable:
        listing_data = listing_generator.generate_willhaben_listing(product_title=product_title, product_category="General", bought_price=current_price, historical_price=historical_price)

        try:
            # 1. UPSERT PRODUCT safely
            supabase.table("products").upsert(
                {"asin": asin, "amazon_locale": "DE", "title": product_title, "category": "General"}, 
                on_conflict="asin,amazon_locale"
            ).execute()
            
            # Fetch the ID separately to avoid returning=minimal issues
            product_res = supabase.table("products").select("id").eq("asin", asin).execute()
            if not product_res.data:
                raise Exception("Could not retrieve product ID after upsert.")
            product_id = product_res.data[0]["id"]

            # 2. CLEAR OLD PRICE HISTORY (To avoid duplicates on multiple scans)
            supabase.table("price_history").delete().eq("product_id", product_id).execute()

            # 3. INSERT FAKE PRICE HISTORY
            history_data = []
            base_date = datetime.now()
            for i in range(5, -1, -1):
                fake_price = historical_price if i > 0 else current_price
                history_data.append({"product_id": product_id, "price_amazon": fake_price, "recorded_at": (base_date - timedelta(days=i)).isoformat()})
            supabase.table("price_history").insert(history_data).execute()

            # 4. INSERT OPPORTUNITY
            opp_res = supabase.table("opportunities").insert({
                "product_id": product_id, "buy_price": current_price, "target_sell_price": listing_data.suggested_price,
                "profit_margin": analysis.estimated_profit_margin, "ai_decision": analysis.reasoning, "status": "pending"
            }).execute()
            opp_id = opp_res.data[0]["id"]

            # 5. INSERT LISTING
            supabase.table("generated_listings").insert({
                "opportunity_id": opp_id, "target_platform": "Willhaben", "language": "de",
                "generated_title": listing_data.generated_title, "generated_description": listing_data.generated_description
            }).execute()
            
            print(f"✅ Successfully saved {asin} to Supabase!")
            
            # 6. NOTIFICATION (Only sends if DB save was 100% successful!)
            await notification_service.send_deal_alert(product_title=product_title, buy_price=current_price, profit_margin=analysis.estimated_profit_margin, amazon_url=amazon_url)
            
        except Exception as e:
            print(f"❌ SUPABASE DB ERROR for {asin}: {str(e)}")
            # Do not send push notification if it didn't save to DB
        
    print(f"🏁 Pipeline finished for {asin}.")

@router.post("/scan")
async def trigger_deal_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(run_deal_scan_pipeline, request.asin)
    return {"status": "accepted", "message": f"Scan started for {request.asin}."}

@router.patch("/{opportunity_id}/status")
async def update_opportunity_status(opportunity_id: str, request: StatusUpdateRequest):
    try:
        res = supabase.table("opportunities").update({"status": request.status}).eq("id", opportunity_id).execute()
        return {"status": "success", "data": res.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))