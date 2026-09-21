"""Builders shared by several test modules."""

from src.agents.deal_analyzer_agent import LlmAnalysis, LlmScores, build_analysis
from src.services.keepa_service import KeepaFacts


def facts(current=30.0, reference=100.0, **overrides) -> KeepaFacts:
    values = dict(
        title="Test Kopfhörer", category="Technology & Electronics", image_url=None,
        current_price=current, price_source="buybox", reference_price=reference, reference_source="buybox_avg90",
        buybox_seller_id="A1XYZ", buybox_is_amazon=True, buybox_is_fba=True, monthly_sold=120,
        price_history=[{"recorded_at": "2026-09-21T12:00:00+00:00", "price_amazon": None, "price_buybox": current}],
    )
    values.update(overrides)
    return KeepaFacts(**values)


def analysis_for(kf: KeepaFacts, score: int):
    llm = LlmAnalysis(
        reasoning="Solid demand.", seasonality_analysis="Fine.", holding_period_months=2,
        scores=LlmScores(demand=score, competition=score, capital_efficiency=score, storage_size=score, risk_level=score, seasonality=score),
        willhaben_realistic_price=70.0, purchase_thesis="I am buying this because it is cheap.",
    )
    return build_analysis(kf, llm)
