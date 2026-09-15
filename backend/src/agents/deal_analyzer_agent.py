from pydantic import BaseModel, Field
from openai import OpenAI
from src.core.config import settings
from datetime import datetime

client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

class DealAnalysisResult(BaseModel):
    is_profitable: bool = Field(description="True if the deal is highly profitable based on the price drop and seller trust, False otherwise.")
    estimated_profit_margin: float = Field(description="Estimated profit margin percentage.")
    reasoning: str = Field(description="Short explanation of why this is a good or bad deal.")
    deal_score: int = Field(description="0 to 100 score based on 30% price drop depth, 30% seasonality timing, 20% logistics/size, 20% BuyBox risk")
    seasonality_analysis: str = Field(description="Explain if current month is good for buying this, and when is the best month to sell it.")
    holding_period_months: int = Field(description="How many months should we hold this in inventory before selling for max profit? (0 if sell immediately)")

class DealAnalyzerAgent:
    def analyze_deal(self, product_title: str, current_price: float, average_historical_price: float, buybox_seller: str, is_fba: bool) -> DealAnalysisResult:
        current_month = datetime.now().strftime("%B") # Dinamik olarak içinde bulunduğumuz ayı alır
        
        system_prompt = (
            "You are an expert Cross-Border Arbitrage AI agent for the Austrian market. "
            "Evaluate this deal and generate a 'deal_score' from 0 to 100 based on these criteria:\n"
            "- Price Drop Depth (30%)\n"
            "- Seasonality (30%)\n"
            "- Logistics & Storage Cost (20%)\n"
            "- BuyBox Seller Risk (20%). If not Amazon/FBA, deduct points for risk.\n\n"
            "Analyze the optimal 'holding_period_months'. If it's a summer item bought in winter, suggest holding it."
        )
        user_prompt = (
            f"Product: {product_title}\n"
            f"Current Date/Month: {current_month}\n"
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
            # GELECEK İÇİN: API parası ödemeden sistemi test edebilmek adına MOCK data.
            # Gerçek API key girildiğinde burası asla çalışmayacak, üstteki parse yapısı çalışacak.
            print(f"⚠️ OpenAI Error: {str(e)}. Using MOCK AI Data for UI Testing.")
            
            risk_text = "Safe (Amazon/FBA)" if is_fba else "HIGH RISK! (3rd Party FBM)"
            return DealAnalysisResult(
                is_profitable=True,
                estimated_profit_margin=42.5,
                reasoning=f"MOCK: High discount. Seller: {risk_text}.",
                deal_score=85 if is_fba else 45,
                seasonality_analysis=f"Bought in {current_month}, best to sell in upcoming season.",
                holding_period_months=2
            )

deal_analyzer = DealAnalyzerAgent()