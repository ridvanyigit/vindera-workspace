from pydantic import BaseModel, Field
from openai import OpenAI
from src.core.config import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

class DealAnalysisResult(BaseModel):
    is_profitable: bool = Field(description="True if the deal is highly profitable based on the price drop, False otherwise.")
    estimated_profit_margin: float = Field(description="Estimated profit margin percentage.")
    reasoning: str = Field(description="Short explanation of why this is a good or bad deal.")

class DealAnalyzerAgent:
    def analyze_deal(self, product_title: str, current_price: float, average_historical_price: float) -> DealAnalysisResult:
        system_prompt = "You are an expert Cross-Border Arbitrage AI agent..."
        user_prompt = f"Product: {product_title}\nPrice: {current_price}\nHistorical: {average_historical_price}"

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
            # FALLBACK: Return a successful MOCK result so the UI can be tested without API credits!
            print(f"⚠️ OpenAI Error: {str(e)}. Using MOCK AI Data for UI Testing.")
            return DealAnalysisResult(
                is_profitable=True,
                estimated_profit_margin=42.5,
                reasoning="MOCK AI: Significant price drop detected. Excellent arbitrage opportunity for the Austrian market."
            )

deal_analyzer = DealAnalyzerAgent()