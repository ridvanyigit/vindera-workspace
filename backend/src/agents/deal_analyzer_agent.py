"""Deal Analyzer Agent.

Scores an Amazon arbitrage opportunity against the 10-criteria Product
Acquisition methodology and returns a fully structured verdict. Falls back to a
deterministic mock result when OpenAI is unavailable, so the pipeline keeps
working without API credits.
"""

from datetime import datetime

from openai import OpenAI
from pydantic import BaseModel, Field

from src.core.config import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key")

MODEL = "gpt-4o-mini"


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


SYSTEM_PROMPT = (
    "You are a master Retail Arbitrage AI for the Austrian market (Willhaben). "
    "You follow the strict '10-Criteria Product Acquisition Score' methodology. "
    "Evaluate the deal based on Discount, Demand, Competition, Capital Requirement, Storage (smaller is better), Risk, and Seasonality. "
    "Provide a score from 0-10 for each in the breakdown, and calculate a total deal_score out of 100. "
    "RULES: If seller is NOT Amazon or FBA, drastically reduce the risk score. "
    "If the product category matches an upcoming event, increase the seasonality score. "
    "Provide strict, professional reasoning."
)


class DealAnalyzerAgent:
    def analyze_deal(
        self,
        product_title: str,
        product_category: str,
        current_price: float,
        average_historical_price: float,
        buybox_seller: str,
        is_fba: bool,
        upcoming_events: str,
    ) -> DealAnalysisResult:
        current_month = datetime.now().strftime("%B")

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
                model=MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format=DealAnalysisResult,
            )
            parsed = completion.choices[0].message.parsed
            if parsed is None:
                raise ValueError("OpenAI returned no structured result (refusal or empty response).")
            return parsed
        except Exception as e:
            # Fabricated analysis is a development aid only; production must fail loudly.
            if not settings.ALLOW_MOCK_DATA:
                raise
            print(f"⚠️ OpenAI Error: {str(e)}. Using MOCK AI Data (ALLOW_MOCK_DATA=true).")
            return self._mock_result(
                product_title=product_title,
                current_price=current_price,
                average_historical_price=average_historical_price,
                is_fba=is_fba,
                current_month=current_month,
            )

    @staticmethod
    def _mock_result(
        product_title: str,
        current_price: float,
        average_historical_price: float,
        is_fba: bool,
        current_month: str,
    ) -> DealAnalysisResult:
        """Deterministic stand-in used when OpenAI is unreachable or out of credit.

        Every field of `DealAnalysisResult` must be populated here: the model has
        no optional fields, so an incomplete mock would raise a ValidationError
        instead of degrading gracefully.
        """
        risk_text = "Safe" if is_fba else "HIGH RISK"
        realistic_price = round(current_price + (average_historical_price - current_price) / 2, 2)

        return DealAnalysisResult(
            is_profitable=True,
            estimated_profit_margin=42.5,
            reasoning=(
                f"MOCK ANALYSIS: Exceptional {risk_text} arbitrage opportunity based on expert criteria. "
                "High demand expected."
            ),
            deal_score=88 if is_fba else 45,
            seasonality_analysis=f"Bought in {current_month}, optimal to sell during upcoming peak season.",
            holding_period_months=2,
            breakdown=ScoreBreakdown(
                discount=9,
                demand=8,
                competition=7,
                capital_efficiency=8,
                storage_size=9,
                risk_level=9 if is_fba else 2,
                seasonality=8,
            ),
            willhaben_realistic_price=realistic_price,
            purchase_thesis=(
                f"MOCK THESIS: I am buying {product_title} because it is currently well below its "
                "historical Amazon price and should resell near that level on Willhaben."
            ),
        )


deal_analyzer = DealAnalyzerAgent()
