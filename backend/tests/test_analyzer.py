"""AI scoring in code, and the rule that no OpenAI request is made without a key."""

import pytest

from src.agents import chatbot_agent
from src.agents.deal_analyzer_agent import (
    LlmAnalysis,
    LlmScores,
    ScoreBreakdown,
    build_analysis,
    compute_deal_score,
    deal_analyzer,
    discount_score,
)
from src.agents.listing_generator_agent import ListingGeneratorAgent, listing_generator
from src.core.config import settings
from src.core.metrics import OPENAI_ERRORS
from tests.helpers import facts


def llm(**scores):
    base = dict(demand=8, competition=8, capital_efficiency=8, storage_size=8, risk_level=8, seasonality=8)
    return LlmAnalysis(
        reasoning="r", seasonality_analysis="s", holding_period_months=2,
        scores=LlmScores(**{**base, **scores}), willhaben_realistic_price=70.0, purchase_thesis="t",
    )


def test_deal_score_is_the_mean_of_the_seven_scores_scaled_to_100():
    assert compute_deal_score(ScoreBreakdown(**{name: 10 for name in ScoreBreakdown.model_fields})) == 100
    assert compute_deal_score(ScoreBreakdown(**{name: 0 for name in ScoreBreakdown.model_fields})) == 0
    mixed = ScoreBreakdown(discount=10, demand=5, competition=5, capital_efficiency=5, storage_size=5, risk_level=5, seasonality=5)
    assert compute_deal_score(mixed) == 57   # (10 + 6 * 5) / 70 * 100 = 57.1


def test_model_scores_outside_the_range_are_clamped_not_trusted():
    analysis = build_analysis(facts(), llm(competition=11, storage_size=-3))
    assert analysis.breakdown.competition == 10
    assert analysis.breakdown.storage_size == 0
    assert 0 <= analysis.deal_score <= 100


def test_demand_is_capped_without_keepa_demand_data():
    unknown = facts(monthly_sold=None, sales_rank_drops_30=None, sales_rank_drops_90=None)
    assert build_analysis(unknown, llm(demand=10)).breakdown.demand == 5
    assert build_analysis(facts(), llm(demand=10)).breakdown.demand == 10


def test_risk_is_capped_for_a_seller_that_is_neither_amazon_nor_fba():
    unverified = facts(buybox_is_amazon=False, buybox_is_fba=False)
    assert build_analysis(unverified, llm(risk_level=9)).breakdown.risk_level == 3
    assert build_analysis(facts(), llm(risk_level=9)).breakdown.risk_level == 9


@pytest.mark.parametrize(("current", "reference", "expected"), [(70, 100, 10), (85, 100, 5), (100, 100, 0), (120, 100, 0), (30, 0, 0)])
def test_discount_score_comes_from_the_prices(current, reference, expected):
    assert discount_score(current, reference) == expected


def test_the_model_no_longer_decides_profitability():
    assert "is_profitable" not in LlmAnalysis.model_fields
    assert "estimated_profit_margin" not in LlmAnalysis.model_fields


# --- no key, no request ----------------------------------------------------------------

async def test_the_analyzer_refuses_to_run_without_a_key_and_makes_no_request():
    before = OPENAI_ERRORS._value.get()
    with pytest.raises(RuntimeError, match="not configured"):
        await deal_analyzer.analyze_deal(facts(), "none")     # a real request would trip the network guard
    assert OPENAI_ERRORS._value.get() == before + 1


async def test_the_listing_writer_refuses_to_run_without_a_key():
    with pytest.raises(RuntimeError, match="not configured"):
        await listing_generator.generate_willhaben_listing("Kopfhörer", "Technology & Electronics", "Barzahlung.")


async def test_with_mock_data_allowed_the_analyzer_returns_a_marked_mock(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_MOCK_DATA", True)
    analysis = await deal_analyzer.analyze_deal(facts(), "none")
    assert analysis.reasoning.startswith("MOCK ANALYSIS")

    listing = await listing_generator.generate_willhaben_listing("Kopfhörer", "Technology & Electronics", "Barzahlung.")
    assert listing.generated_title


def test_fixed_text_is_appended_verbatim_and_never_invented():
    text = ListingGeneratorAgent.append_fixed_text("Body.", "Pay cash.", "")
    assert "Pay cash." in text
    with_footer = ListingGeneratorAgent.append_fixed_text("Body.", "Pay cash.", "Footer as written by the owner.")
    assert with_footer.endswith("Footer as written by the owner.")


def test_the_chatbot_cannot_delete_anything():
    assert not hasattr(chatbot_agent, "delete_asin")
    source = open(chatbot_agent.__file__).read()
    assert "/delete" not in source and "delete_asin" not in source
