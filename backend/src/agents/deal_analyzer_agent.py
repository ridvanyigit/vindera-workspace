from pydantic import BaseModel, Field
from openai import OpenAI
from src.core.config import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

class DealAnalysisResult(BaseModel):
    is_profitable: bool = Field(description="True if the deal is highly profitable based on the price drop and seller trust, False otherwise.")
    estimated_profit_margin: float = Field(description="Estimated profit margin percentage.")
    reasoning: str = Field(description="Short explanation of why this is a good or bad deal, including BuyBox seller risk assessment.")

class DealAnalyzerAgent:
    def analyze_deal(self, product_title: str, current_price: float, average_historical_price: float, buybox_seller: str, is_fba: bool) -> DealAnalysisResult:
        system_prompt = (
            "You are an expert Cross-Border Arbitrage AI agent for the Austrian market. "
            "Analyze the price drop AND the BuyBox Seller risk. "
            "RULES: If the seller is 'Amazon' or uses 'FBA' (Fulfillment by Amazon), it is safe. "
            "If the seller is a 3rd party without FBA (is_fba=False), warn the user about high shipping/scam risks, even if the price is low."
        )
        user_prompt = (
            f"Product: {product_title}\nPrice: {current_price}\nHistorical: {average_historical_price}\n"
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
            # FALLBACK MOCK IF NO CREDITS
            print(f"⚠️ OpenAI Error: {str(e)}. Using MOCK AI Data for UI Testing.")
            
            risk_text = "Safe (Amazon/FBA)" if is_fba else "HIGH RISK! (3rd Party FBM)"
            return DealAnalysisResult(
                is_profitable=True,
                estimated_profit_margin=42.5,
                reasoning=f"MOCK AI: Significant price drop detected. Seller Analysis: {risk_text}. Excellent arbitrage opportunity."
            )

deal_analyzer = DealAnalyzerAgent()