from pydantic import BaseModel, Field
from openai import OpenAI
from src.core.config import settings

# Bu ajan, ürünün geçmiş fiyatıyla bugünkü fiyatını kıyaslayacak ve mantıksal bir karar (True/False) üretecektir. Pydantic kullanarak yapay zekadan her zaman sabit bir JSON formatında (yapılandırılmış) veri almayı garanti edeceğiz.
# Initialize OpenAI Client
# Note: Ensure you have added your OPENAI_API_KEY to your .env file
client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

class DealAnalysisResult(BaseModel):
    is_profitable: bool = Field(description="True if the deal is highly profitable based on the price drop, False otherwise.")
    estimated_profit_margin: float = Field(description="Estimated profit margin percentage.")
    reasoning: str = Field(description="Short explanation of why this is a good or bad deal.")

class DealAnalyzerAgent:
    def analyze_deal(self, product_title: str, current_price: float, average_historical_price: float) -> DealAnalysisResult:
        """
        Analyzes if a product is worth buying based on its current price vs historical average.
        """
        system_prompt = (
            "You are an expert Cross-Border Arbitrage AI agent for the European market. "
            "Your job is to analyze Amazon price drops. We buy cheap on Amazon and sell on local platforms like Willhaben. "
            "Calculate the viability of purchasing the item. Generally, a price drop of more than 40% from the historical average is a strong buy."
        )

        user_prompt = (
            f"Product: {product_title}\n"
            f"Current Amazon Price: €{current_price}\n"
            f"Historical Average Price: €{average_historical_price}\n\n"
            "Analyze this deal and provide a structured JSON response."
        )

        try:
            completion = client.beta.chat.completions.parse(
                model="gpt-4o-mini", # Very fast and cost-effective
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format=DealAnalysisResult,
            )
            return completion.choices[0].message.parsed
        except Exception as e:
            print(f"Error in DealAnalyzerAgent: {str(e)}")
            # Fallback response in case of API failure
            return DealAnalysisResult(is_profitable=False, estimated_profit_margin=0.0, reasoning="API Error occurred.")

deal_analyzer = DealAnalyzerAgent()