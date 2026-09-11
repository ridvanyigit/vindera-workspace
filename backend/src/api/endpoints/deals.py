from fastapi import APIRouter, BackgroundTasks
from src.services.keepa_service import keepa_service
from src.agents.deal_analyzer_agent import deal_analyzer
from src.services.notification_service import notification_service
import asyncio

router = APIRouter(prefix="/deals", tags=["Deals Orchestration"])

async def run_deal_scan_pipeline():
    """
    This is the core pipeline. It runs in the background so the API responds instantly.
    In the future, Keepa API data will feed into this. For now, it's a structural mockup.
    """
    print("🚀 Starting Amazon Deal Scan Pipeline...")
    
    # 1. Fetch data from Keepa (Simulated for now)
    # products = await keepa_service.get_daily_drops()
    await asyncio.sleep(2) # Simulating network delay
    
    mock_product = "Sony WH-1000XM5 Wireless Headphones"
    mock_current_price = 199.0
    mock_historical_price = 349.0
    mock_amazon_url = "https://amazon.de/dp/B09Y2MYL5C"

    print(f"📦 Analyzing product: {mock_product}")
    
    # 2. Ask AI if this is a good deal
    analysis = deal_analyzer.analyze_deal(
        product_title=mock_product,
        current_price=mock_current_price,
        average_historical_price=mock_historical_price
    )
    
    print(f"🧠 AI Decision: Profitable? {analysis.is_profitable} | Reason: {analysis.reasoning}")

    # 3. If profitable, send push notification and save to Supabase
    if analysis.is_profitable:
        await notification_service.send_deal_alert(
            product_title=mock_product,
            buy_price=mock_current_price,
            profit_margin=analysis.estimated_profit_margin,
            amazon_url=mock_amazon_url
        )
        # TODO: Save to Supabase opportunities table
        
    print("✅ Pipeline execution finished.")


@router.post("/scan")
async def trigger_deal_scan(background_tasks: BackgroundTasks):
    """
    Endpoint for n8n to trigger the daily scan.
    Returns 202 Accepted immediately and runs the heavy AI/Scraping in the background.
    """
    background_tasks.add_task(run_deal_scan_pipeline)
    return {
        "status": "accepted", 
        "message": "Deal scan pipeline started in the background."
    }