"""Profit calculator: the single source of truth for money math.

Every profit, margin, break-even and guardrail figure the backend stores or
returns comes from this module. The frontend keeps a port for live previews
(frontend/src/lib/profit.ts) that must agree with
backend/tests/data/profit_golden_vectors.json; the backend always recomputes
and stores its own figures on save.

Formulas (all amounts EUR):

    total_cost      = purchase_price + inbound_shipping + packaging
    platform_fees   = sell_price * platform_fee_pct / 100 + platform_fee_fixed
    payment_fees    = sell_price * payment_fee_pct / 100
    return_reserve  = sell_price * return_reserve_pct / 100
    net_profit      = sell_price - total_cost - outbound_shipping
                      - platform_fees - payment_fees - return_reserve
    net_margin_pct  = net_profit / total_cost * 100      (margin on COST, not on price)

Rounding: every euro amount is rounded to cents, half away from zero, BEFORE it
is used in the next step, so the printed figures always add up exactly like a
receipt. The margin is rounded to two decimals of a percent.

Pure functions, `Decimal` internally, no I/O. Settings are passed in; see
`services/business_settings.py` for loading them from the database.
"""

from dataclasses import dataclass
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
HUNDRED = Decimal(100)

# Liquidation price used when inventory has to be cleared quickly, as a share of
# the target sell price. Never applied below the break-even price.
EMERGENCY_PRICE_RATIO = Decimal("0.85")

# Fallbacks used ONLY when the business_settings row is missing. They match the
# placeholder defaults of the migration (assumptions, to be confirmed by the owner).
FALLBACK_MIN_NET_MARGIN_PCT = Decimal(25)
FALLBACK_MIN_NET_PROFIT_EUR = Decimal(15)


def to_decimal(value: "Decimal | int | float | str") -> Decimal:
    # `str()` avoids binary float artefacts (0.1 + 0.2 style) leaking into money.
    return value if isinstance(value, Decimal) else Decimal(str(value))


def money(value: "Decimal | int | float | str") -> Decimal:
    """Round to whole cents, halves away from zero."""
    return to_decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class ProfitSettings:
    """The subset of `business_settings` the profit math depends on."""

    outbound_shipping_eur: Decimal = Decimal("6.90")
    packaging_eur: Decimal = Decimal("1.50")
    inbound_shipping_eur: Decimal = Decimal(0)
    platform_fee_pct: Decimal = Decimal(0)
    platform_fee_fixed_eur: Decimal = Decimal(0)
    payment_fee_pct: Decimal = Decimal(0)
    return_reserve_pct: Decimal = Decimal(3)
    min_net_margin_pct: Decimal = FALLBACK_MIN_NET_MARGIN_PCT
    min_net_profit_eur: Decimal = FALLBACK_MIN_NET_PROFIT_EUR

    @classmethod
    def from_row(cls, row: dict) -> "ProfitSettings":
        """Build from a `business_settings` row; keys that are absent keep their default."""
        defaults = cls()
        values = {
            name: to_decimal(row[name]) if row.get(name) is not None else getattr(defaults, name)
            for name in cls.__dataclass_fields__
        }
        return cls(**values)


@dataclass(frozen=True)
class ProfitResult:
    sell_price: Decimal
    total_cost: Decimal
    outbound_shipping: Decimal
    platform_fees: Decimal
    payment_fees: Decimal
    return_reserve: Decimal
    net_profit: Decimal
    net_margin_pct: Decimal
    break_even_price: Decimal | None


def calculate(
    *,
    sell_price: "Decimal | int | float | str",
    purchase_price: "Decimal | int | float | str",
    settings: ProfitSettings,
    inbound_shipping: "Decimal | int | float | str | None" = None,
    packaging: "Decimal | int | float | str | None" = None,
    outbound_shipping: "Decimal | int | float | str | None" = None,
) -> ProfitResult:
    """Net profit for one unit. The three optional costs override the settings defaults per deal."""
    sell = money(sell_price)
    purchase = money(purchase_price)
    if purchase <= 0:
        raise ValueError("purchase_price must be greater than zero")
    if sell < 0:
        raise ValueError("sell_price must not be negative")

    inbound = money(settings.inbound_shipping_eur if inbound_shipping is None else inbound_shipping)
    pack = money(settings.packaging_eur if packaging is None else packaging)
    outbound = money(settings.outbound_shipping_eur if outbound_shipping is None else outbound_shipping)

    total_cost = purchase + inbound + pack
    platform_fees = money(sell * settings.platform_fee_pct / HUNDRED + settings.platform_fee_fixed_eur)
    payment_fees = money(sell * settings.payment_fee_pct / HUNDRED)
    return_reserve = money(sell * settings.return_reserve_pct / HUNDRED)
    net_profit = sell - total_cost - outbound - platform_fees - payment_fees - return_reserve
    net_margin = (net_profit / total_cost * HUNDRED).quantize(CENT, rounding=ROUND_HALF_UP)

    return ProfitResult(
        sell_price=sell,
        total_cost=total_cost,
        outbound_shipping=outbound,
        platform_fees=platform_fees,
        payment_fees=payment_fees,
        return_reserve=return_reserve,
        net_profit=net_profit,
        net_margin_pct=net_margin,
        break_even_price=break_even_price(
            total_cost=total_cost, outbound_shipping=outbound, settings=settings
        ),
    )


def break_even_price(
    *, total_cost: Decimal, outbound_shipping: Decimal, settings: ProfitSettings
) -> Decimal | None:
    """Sell price at which net profit reaches zero.

    Solves sell = (cost + outbound + fixed_fee) / (1 - variable_rate), rounds UP
    to the cent, then steps up cent by cent while the ROUNDED net profit is still
    negative (each fee is rounded separately), so the result never loses money in
    the same arithmetic `calculate` uses. It can sit one cent above the true
    optimum. Returns None when the variable fees alone eat 100% or more of the price.
    """
    rate = (settings.platform_fee_pct + settings.payment_fee_pct + settings.return_reserve_pct) / HUNDRED
    if rate >= 1:
        return None

    fixed = total_cost + outbound_shipping + settings.platform_fee_fixed_eur
    candidate = (fixed / (1 - rate)).quantize(CENT, rounding=ROUND_CEILING)

    def net_at(price: Decimal) -> Decimal:
        fees = (
            money(price * settings.platform_fee_pct / HUNDRED + settings.platform_fee_fixed_eur)
            + money(price * settings.payment_fee_pct / HUNDRED)
            + money(price * settings.return_reserve_pct / HUNDRED)
        )
        return price - total_cost - outbound_shipping - fees

    while net_at(candidate) < 0:
        candidate += CENT
    return candidate


def min_emergency_price(sell_price: "Decimal | int | float | str", break_even: Decimal | None) -> Decimal:
    """Liquidation price: 85% of the target, but never below break-even."""
    ratio_price = money(to_decimal(sell_price) * EMERGENCY_PRICE_RATIO)
    return max(ratio_price, break_even) if break_even is not None else ratio_price


def suggest_sell_price(
    current_price: "Decimal | int | float | str",
    reference_price: "Decimal | int | float | str",
    position: "Decimal | int | float | str" = "0.5",
) -> Decimal:
    """Point between today's price (position 0) and the reference price (position 1)."""
    current = to_decimal(current_price)
    reference = to_decimal(reference_price)
    return money(current + (reference - current) * to_decimal(position))


def passes_guardrails(
    net_profit: "Decimal | int | float | str",
    net_margin_pct: "Decimal | int | float | str",
    settings: ProfitSettings,
) -> bool:
    """The "No-Buy" rule: a deal must reach BOTH minimums (equal counts as passing)."""
    return (
        to_decimal(net_margin_pct) >= settings.min_net_margin_pct
        and to_decimal(net_profit) >= settings.min_net_profit_eur
    )


# profit_margin / net_margin_estimate are numeric(8,2): clamp so an absurd ratio
# (a EUR 0.01 purchase) cannot make the whole save fail.
MAX_STORED_MARGIN_PCT = Decimal("999999.99")


def storable_margin(margin_pct: Decimal) -> float:
    return float(max(-MAX_STORED_MARGIN_PCT, min(MAX_STORED_MARGIN_PCT, margin_pct)))


def as_float(value: Decimal | None) -> float | None:
    """JSON / database boundary helper: the API and PostgREST payloads carry plain numbers."""
    return None if value is None else float(value)
