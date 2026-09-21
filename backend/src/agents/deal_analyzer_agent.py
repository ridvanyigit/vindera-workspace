"""Deal Analyzer Agent.

Produces the qualitative part of a deal verdict (reasoning, seasonality, thesis
and six 0-10 scores). Everything that is arithmetic stays in code:

  * whether a deal is profitable is decided by `profit_calculator` (never the model),
  * the `discount` score is computed from the Keepa prices,
  * `deal_score` is computed from the seven breakdown values with `SCORE_WEIGHTS`,
  * demand and risk scores are capped when Keepa gives no evidence for them.

OpenAI failures raise; a deterministic stand-in is only used with ALLOW_MOCK_DATA.
"""

import logging
from datetime import datetime, timezone

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from src.core.config import settings
from src.core.metrics import OPENAI_ERRORS
from src.services.keepa_service import KeepaFacts

logger = logging.getLogger(__name__)

client = AsyncOpenAI(
    api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else "dummy_key",
    timeout=60.0,
    max_retries=2,
)

# deal_score = weighted mean of the seven 0-10 scores, scaled to 0-100.
# Equal weights by default; change a weight here to shift what matters.
SCORE_WEIGHTS: dict[str, int] = {
    "discount": 1,
    "demand": 1,
    "competition": 1,
    "capital_efficiency": 1,
    "storage_size": 1,
    "risk_level": 1,
    "seasonality": 1,
}

# A discount of this many percent below the reference price scores the full 10.
FULL_DISCOUNT_SCORE_PCT = 30
# Ceilings applied when there is no evidence for a good score.
NO_DEMAND_DATA_MAX_SCORE = 5
UNVERIFIED_SELLER_MAX_RISK_SCORE = 3


class LlmScores(BaseModel):
    """Plain integers on purpose: bounds are enforced in code (`_clamp`), so an
    answer of 11 cannot fail the whole scan, and the schema sent to OpenAI stays
    free of numeric constraints."""

    demand: int = Field(description="0-10: Demand, grounded in the Keepa figures given (monthly sales, sales-rank drops). Use 5 when no figure is given.")
    competition: int = Field(description="0-10: Estimated competition. Fewer competitors = higher score.")
    capital_efficiency: int = Field(description="0-10: Does it tie up too much capital? Cheaper items get higher scores.")
    storage_size: int = Field(description="0-10: How easy is it to store? Small items get higher scores.")
    risk_level: int = Field(description="0-10: Lower risk (Amazon or FBA seller, no expiry) gets a higher score.")
    seasonality: int = Field(description="0-10: Is it a good time to buy based on upcoming events/seasons?")


class LlmAnalysis(BaseModel):
    reasoning: str = Field(description="Analysis of the deal. State clearly what you do not know.")
    seasonality_analysis: str = Field(description="Explain if the current month is good for buying this, and when to sell.")
    holding_period_months: int = Field(description="Months to hold in inventory before selling.")
    scores: LlmScores
    willhaben_realistic_price: float = Field(description="Your rough estimate of a realistic Willhaben transaction price in euros. It is a guess, not market data.")
    purchase_thesis: str = Field(description="A short 'Decision Journal' entry starting with 'I am buying this because...' explaining the core market logic.")


class ScoreBreakdown(BaseModel):
    discount: int = Field(ge=0, le=10)
    demand: int = Field(ge=0, le=10)
    competition: int = Field(ge=0, le=10)
    capital_efficiency: int = Field(ge=0, le=10)
    storage_size: int = Field(ge=0, le=10)
    risk_level: int = Field(ge=0, le=10)
    seasonality: int = Field(ge=0, le=10)


class DealAnalysis(BaseModel):
    reasoning: str
    seasonality_analysis: str
    holding_period_months: int = Field(ge=0, le=60)
    breakdown: ScoreBreakdown
    deal_score: int = Field(ge=0, le=100)
    willhaben_realistic_price: float | None
    purchase_thesis: str


SYSTEM_PROMPT = (
    "You are a retail-arbitrage analyst for the Austrian market (Willhaben). "
    "You will get facts from Keepa (Amazon.de price data) for one product. "
    "You have NO access to Willhaben data: you do not know its real asking prices, "
    "number of competing ads or actual demand there. Say so plainly in your reasoning "
    "and do not invent Willhaben figures; your willhaben_realistic_price is a rough guess. "
    "Do NOT decide whether the deal is profitable and do NOT compute margins: that is "
    "done separately from the real costs. "
    "Score each criterion from 0 to 10 (integers). Ground 'demand' in the Keepa figures "
    "provided (monthly sales, sales-rank drops); if none are provided, score it 5 and say it is unknown. "
    "If the BuyBox seller is neither Amazon nor FBA, or unknown, give a low risk score. "
    "If the product category matches an upcoming event, raise the seasonality score. "
    "Give strict, professional reasoning."
)


def _clamp(value: int) -> int:
    return max(0, min(10, int(value)))


def discount_score(current_price: float, reference_price: float) -> int:
    """0-10 from how far today's price sits below the reference price."""
    if reference_price <= 0:
        return 0
    discount_pct = (reference_price - current_price) / reference_price * 100
    return _clamp(round(discount_pct / FULL_DISCOUNT_SCORE_PCT * 10))


def compute_deal_score(breakdown: ScoreBreakdown) -> int:
    """Weighted mean of the seven scores, 0-100."""
    values = breakdown.model_dump()
    total_weight = sum(SCORE_WEIGHTS.values())
    weighted = sum(SCORE_WEIGHTS[name] * values[name] for name in SCORE_WEIGHTS)
    return round(weighted / (10 * total_weight) * 100)


def _has_demand_evidence(facts: KeepaFacts) -> bool:
    return facts.monthly_sold is not None or facts.sales_rank_drops_30 is not None or facts.sales_rank_drops_90 is not None


def _has_trusted_seller(facts: KeepaFacts) -> bool:
    return bool(facts.buybox_is_amazon) or bool(facts.buybox_is_fba)


def build_analysis(facts: KeepaFacts, llm: LlmAnalysis) -> DealAnalysis:
    """Combine the model's qualitative output with the scores computed in code."""
    scores = llm.scores
    demand = _clamp(scores.demand)
    risk = _clamp(scores.risk_level)
    if not _has_demand_evidence(facts):
        demand = min(demand, NO_DEMAND_DATA_MAX_SCORE)
    if not _has_trusted_seller(facts):
        risk = min(risk, UNVERIFIED_SELLER_MAX_RISK_SCORE)

    breakdown = ScoreBreakdown(
        discount=discount_score(facts.current_price, facts.reference_price),
        demand=demand,
        competition=_clamp(scores.competition),
        capital_efficiency=_clamp(scores.capital_efficiency),
        storage_size=_clamp(scores.storage_size),
        risk_level=risk,
        seasonality=_clamp(scores.seasonality),
    )
    realistic = llm.willhaben_realistic_price
    return DealAnalysis(
        reasoning=llm.reasoning,
        seasonality_analysis=llm.seasonality_analysis,
        holding_period_months=max(0, min(60, int(llm.holding_period_months))),
        breakdown=breakdown,
        deal_score=compute_deal_score(breakdown),
        willhaben_realistic_price=round(realistic, 2) if realistic and 0 < realistic <= 100_000 else None,
        purchase_thesis=llm.purchase_thesis,
    )


def _describe_facts(facts: KeepaFacts) -> str:
    def known(value: object) -> str:
        return "unknown" if value is None else str(value)

    return (
        f"Price today: EUR {facts.current_price:.2f} (source: {facts.price_source})\n"
        f"90-day reference price: EUR {facts.reference_price:.2f} (source: {facts.reference_source})\n"
        f"BuyBox seller: {facts.buybox_seller_label}; Amazon itself: {known(facts.buybox_is_amazon)}; FBA: {known(facts.buybox_is_fba)}\n"
        f"Sold last month (Keepa monthlySold): {known(facts.monthly_sold)}\n"
        f"Sales rank now: {known(facts.sales_rank)}; sales-rank drops last 30 days: {known(facts.sales_rank_drops_30)}, "
        f"last 90 days: {known(facts.sales_rank_drops_90)}"
    )


class DealAnalyzerAgent:
    async def analyze_deal(self, facts: KeepaFacts, upcoming_events: str) -> DealAnalysis:
        current_month = datetime.now(timezone.utc).strftime("%B")
        user_prompt = (
            f"Product: {facts.title}\n"
            f"Category: {facts.category}\n"
            f"Current month: {current_month}\n"
            f"Upcoming events (next 90 days): {upcoming_events}\n"
            f"{_describe_facts(facts)}"
        )

        try:
            if not settings.openai_configured:
                raise RuntimeError("OpenAI API key is not configured.")
            completion = await client.beta.chat.completions.parse(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format=LlmAnalysis,
            )
            parsed = completion.choices[0].message.parsed
            if parsed is None:
                raise ValueError("OpenAI returned no structured result (refusal or empty response).")
            return build_analysis(facts, parsed)
        except Exception as e:
            OPENAI_ERRORS.inc()
            # Fabricated analysis is a development aid only; production must fail loudly.
            if not settings.ALLOW_MOCK_DATA:
                raise
            logger.warning("OpenAI failed (%s); using MOCK analysis (ALLOW_MOCK_DATA=true)", type(e).__name__)
            return self._mock_analysis(facts, current_month)

    @staticmethod
    def _mock_analysis(facts: KeepaFacts, current_month: str) -> DealAnalysis:
        """Deterministic stand-in used when OpenAI is unreachable (development only)."""
        llm = LlmAnalysis(
            reasoning="MOCK ANALYSIS: no real analysis was performed.",
            seasonality_analysis=f"MOCK: bought in {current_month}.",
            holding_period_months=2,
            scores=LlmScores(
                demand=8, competition=7, capital_efficiency=8, storage_size=9,
                risk_level=9 if facts.buybox_is_fba else 2, seasonality=8,
            ),
            willhaben_realistic_price=round(facts.current_price + (facts.reference_price - facts.current_price) / 2, 2),
            purchase_thesis=f"MOCK THESIS: I am buying {facts.title} because it is below its 90-day reference price.",
        )
        return build_analysis(facts, llm)


deal_analyzer = DealAnalyzerAgent()
