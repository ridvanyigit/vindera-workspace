from pydantic import BaseModel, Field
from openai import OpenAI
from src.core.config import settings
from datetime import datetime
import json

client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

class ScoreBreakdown(BaseModel):
    discount: int = Field(description="0-10: How deep is the discount from historical price?")
    demand: int = Field(description="0-10: Estimated demand on Willhaben (Austria).")
    competition: int = Field(description="0-10: Estimated competition. Fewer competitors = higher score.")
    capital_efficiency: int = Field(description="0-10: Does it tie up too much capital? Cheaper items get higher scores.")
    storage_size: int = Field(description="0-10: How easy is it to store? Small items get higher scores.")
    risk_level: int = Field(description="0-10: Lower risk (Amazon/FBA, no expiration) gets higher score.")
    seasonality: int = Field(description="0-10: Is it a good time to buy based on upcoming events/seasons?")

class DealAnalysisResult(BaseModel):
    is_profitable: bool = Field(description="True if the deal is highly profitable.")
    estimated_profit_margin: float = Field(description="Estimated profit margin percentage.")
    reasoning: str = Field(description="Detailed analysis based on the 10 Expert Criteria.")
    deal_score: int = Field(description="0 to 100 overall Product Acquisition Score based on the breakdown.")
    seasonality_analysis: str = Field(description="Explain if current month is good for buying this, and when to sell.")
    holding_period_months: int = Field(description="Months to hold in inventory before selling.")
    breakdown: ScoreBreakdown = Field(description="0-10 score for each specific criteria.")
    willhaben_realistic_price: float = Field(description="Estimated realistic transaction price on Willhaben (Austria).")
    purchase_thesis: str = Field(description="A short 'Decision Journal' entry starting with 'I am buying this because...' explaining the core market logic.")

class DealAnalyzerAgent:
    def analyze_deal(self, product_title: str, product_category: str, current_price: float, average_historical_price: float, buybox_seller: str, is_fba: bool, upcoming_events: str) -> DealAnalysisResult:
        current_month = datetime.now().strftime("%B")
        
        system_prompt = (
            "You are a master Retail Arbitrage AI for the Austrian market (Willhaben). "
            "You follow the strict '10-Criteria Product Acquisition Score' methodology. "
            "Evaluate the deal based on Discount, Demand, Competition, Capital Requirement, Storage (smaller is better), Risk, and Seasonality. "
            "Provide a score from 0-10 for each in the breakdown, and calculate a total deal_score out of 100. "
            "RULES: If seller is NOT Amazon or FBA, drastically reduce the risk score. "
            "If the product category matches an upcoming event, increase the seasonality score. "
            "Provide strict, professional reasoning."
        )
        user_prompt = (
            f"Product: {product_title}\n"
            f"Category: {product_category}\n"
            f"Current Date/Month: {current_month}\n"
            f"Upcoming Events (Next 90 Days): {upcoming_events}\n"
            f"Price: €{current_price}\nHistorical: €{average_historical_price}\n"
            f"BuyBox Seller: {buybox_seller}\nIs FBA?: {is_fba}"
        )

        try:
            completion = client.beta.chat.completions.parse(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format=DealAnalysisResult,
            )
            return completion.choices[0].message.parsed
        except Exception as e:
            print(f"⚠️ OpenAI Error: {str(e)}. Using MOCK AI Data.")
            
            risk_text = "Safe" if is_fba else "HIGH RISK"
            overall_score = 88 if is_fba else 45
            
            # Simulated MOCK breakdown for testing without API keys
            mock_breakdown = ScoreBreakdown(
                discount=9, demand=8, competition=7, capital_efficiency=8, storage_size=9, risk_level=9 if is_fba else 2, seasonality=8
            )
            
            return DealAnalysisResult(
                is_profitable=True,
                estimated_profit_margin=42.5,
                reasoning=f"MOCK ANALYSIS: Exceptional {risk_text} arbitrage opportunity based on expert criteria. High demand expected.",
                deal_score=overall_score,
                seasonality_analysis=f"Bought in {current_month}, optimal to sell during upcoming peak season.",
                holding_period_months=2,
                breakdown=mock_breakdown
            )

deal_analyzer = DealAnalyzerAgent()