"""Profit engine: golden vectors, properties, guardrail boundaries, actual profit."""

import json
from decimal import Decimal
from pathlib import Path

import pytest

from src.services.profit_calculator import (
    ProfitSettings,
    actual_profit,
    break_even_price,
    calculate,
    min_emergency_price,
    money,
    passes_guardrails,
    storable_margin,
    suggest_sell_price,
)

VECTORS = json.loads((Path(__file__).parent / "data" / "profit_golden_vectors.json").read_text())["vectors"]


def _run(vector):
    settings = ProfitSettings.from_row(vector["settings"])
    inputs = vector["input"]
    result = calculate(
        sell_price=inputs["sell_price"],
        purchase_price=inputs["purchase_price"],
        inbound_shipping=inputs["inbound_shipping"],
        packaging=inputs["packaging"],
        outbound_shipping=inputs["outbound_shipping"],
        settings=settings,
    )
    return settings, result


def test_there_are_enough_golden_vectors():
    assert len(VECTORS) >= 8


@pytest.mark.parametrize("vector", VECTORS, ids=[v["name"] for v in VECTORS])
def test_golden_vector(vector):
    settings, result = _run(vector)
    expected = vector["expected"]

    assert result.total_cost == money(expected["total_cost"])
    assert result.platform_fees == money(expected["platform_fees"])
    assert result.payment_fees == money(expected["payment_fees"])
    assert result.return_reserve == money(expected["return_reserve"])
    assert result.net_profit == money(expected["net_profit"])
    assert result.net_margin_pct == money(expected["net_margin_pct"])
    if expected["break_even_price"] is None:
        assert result.break_even_price is None
    else:
        assert result.break_even_price == money(expected["break_even_price"])
    assert min_emergency_price(result.sell_price, result.break_even_price) == money(expected["emergency_price"])
    assert passes_guardrails(result.net_profit, result.net_margin_pct, settings) is expected["passes_guardrails"]


@pytest.mark.parametrize("vector", [v for v in VECTORS if v["expected"]["break_even_price"] is not None], ids=lambda v: v["name"])
def test_break_even_price_neither_loses_money_nor_overshoots(vector):
    settings, result = _run(vector)
    inputs = vector["input"]

    def net_at(price):
        return calculate(
            sell_price=price,
            purchase_price=inputs["purchase_price"],
            inbound_shipping=inputs["inbound_shipping"],
            packaging=inputs["packaging"],
            outbound_shipping=inputs["outbound_shipping"],
            settings=settings,
        ).net_profit

    assert net_at(result.break_even_price) >= 0
    assert net_at(result.break_even_price - Decimal("0.02")) < 0  # at most one cent above the optimum


def test_net_profit_never_decreases_when_the_sell_price_rises():
    settings = ProfitSettings(platform_fee_pct=Decimal("8"), payment_fee_pct=Decimal("2.5"), platform_fee_fixed_eur=Decimal("0.5"))
    previous = None
    for price in range(0, 400, 7):
        net = calculate(sell_price=price, purchase_price=30, settings=settings).net_profit
        if previous is not None:
            assert net >= previous
        previous = net


def test_emergency_price_is_never_below_break_even():
    settings = ProfitSettings(platform_fee_pct=Decimal("12"), return_reserve_pct=Decimal("5"))
    for sell in (30, 45, 60, 99.99, 250):
        result = calculate(sell_price=sell, purchase_price=28, settings=settings)
        assert min_emergency_price(result.sell_price, result.break_even_price) >= result.break_even_price


def test_emergency_price_is_85_percent_when_that_is_above_break_even():
    assert min_emergency_price(100, Decimal("50.00")) == Decimal("85.00")
    assert min_emergency_price(100, Decimal("92.00")) == Decimal("92.00")
    assert min_emergency_price(100, None) == Decimal("85.00")


def test_break_even_is_none_when_variable_fees_take_everything():
    settings = ProfitSettings(platform_fee_pct=Decimal("60"), payment_fee_pct=Decimal("40"), return_reserve_pct=Decimal(0))
    assert break_even_price(total_cost=Decimal("10"), outbound_shipping=Decimal(0), settings=settings) is None


def test_rounding_is_half_up_per_step():
    # 3% of 10.50 is 0.315 -> 0.32 (half away from zero), not 0.31 (banker's rounding).
    settings = ProfitSettings(return_reserve_pct=Decimal(3), packaging_eur=Decimal(0), outbound_shipping_eur=Decimal(0))
    assert calculate(sell_price="10.50", purchase_price=5, settings=settings).return_reserve == Decimal("0.32")
    assert money("0.125") == Decimal("0.13")


@pytest.mark.parametrize("purchase", [0, -5])
def test_purchase_price_must_be_positive(purchase):
    with pytest.raises(ValueError):
        calculate(sell_price=50, purchase_price=purchase, settings=ProfitSettings())


def test_per_deal_costs_override_the_defaults():
    settings = ProfitSettings(inbound_shipping_eur=Decimal(0), packaging_eur=Decimal("1.50"), outbound_shipping_eur=Decimal("6.90"))
    default = calculate(sell_price=60, purchase_price=20, settings=settings)
    custom = calculate(sell_price=60, purchase_price=20, settings=settings, inbound_shipping=2, packaging=1, outbound_shipping=0)
    assert default.total_cost == Decimal("21.50")
    assert custom.total_cost == Decimal("23.00")
    assert custom.outbound_shipping == Decimal("0.00")


# --- guardrails: both minimums must be reached, equal counts -------------------

GUARD = ProfitSettings(min_net_margin_pct=Decimal(25), min_net_profit_eur=Decimal(15))


@pytest.mark.parametrize(
    ("net_profit", "margin", "expected"),
    [
        ("15.00", "25.00", True),    # exactly on both limits
        ("14.99", "25.00", False),   # one cent short of the profit minimum
        ("15.00", "24.99", False),   # a hundredth of a percent short of the margin minimum
        ("100", "24.99", False),
        ("14.99", "300", False),
        ("40", "60", True),
    ],
)
def test_guardrail_boundaries(net_profit, margin, expected):
    assert passes_guardrails(net_profit, margin, GUARD) is expected


def test_guardrails_use_the_owners_limits():
    strict = ProfitSettings(min_net_margin_pct=Decimal(40), min_net_profit_eur=Decimal(30))
    assert passes_guardrails("29.99", "50", strict) is False
    assert passes_guardrails("30", "40", strict) is True


# --- actual profit (recorded sale) --------------------------------------------

def test_actual_profit_of_the_manual_test_scenario():
    # docs/MANUAL-TEST-SCRIPT.md: paid 20 + 2 inbound + 1 packaging, sold for 60 with 6.90 shipping.
    outcome = actual_profit(sale_amount=60, purchase_price=20, inbound_shipping=2, packaging=1, shipping_cost=6.90)
    assert outcome.total_cost == Decimal("23.00")
    assert outcome.net_profit == Decimal("30.10")
    assert outcome.net_margin_pct == Decimal("130.87")


def test_actual_profit_counts_unrecorded_costs_as_zero_and_survives_zero_cost():
    outcome = actual_profit(sale_amount=50, purchase_price=10)
    assert outcome.net_profit == Decimal("40.00")
    assert actual_profit(sale_amount=5, purchase_price=0).net_margin_pct is None


# --- helpers -------------------------------------------------------------------

def test_suggest_sell_price_is_the_midpoint_by_default():
    assert suggest_sell_price(30, 100) == Decimal("65.00")
    assert suggest_sell_price(30, 100, "1") == Decimal("100.00")
    assert suggest_sell_price(30, 100, "0.25") == Decimal("47.50")


def test_storable_margin_is_clamped_to_the_column_width():
    assert storable_margin(Decimal("12345678")) == 999999.99
    assert storable_margin(Decimal("-12345678")) == -999999.99
    assert storable_margin(Decimal("62.86")) == 62.86


def test_settings_row_with_missing_keys_keeps_defaults():
    settings = ProfitSettings.from_row({"platform_fee_pct": 5, "packaging_eur": None})
    assert settings.platform_fee_pct == Decimal(5)
    assert settings.packaging_eur == ProfitSettings().packaging_eur
