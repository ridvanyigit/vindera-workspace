"""Keepa parsing (cents, -1, categories, time conversion) and the HTTP client's failure handling."""

import asyncio
from datetime import datetime, timezone

import httpx
import pytest

from src.services import keepa_service as keepa
from src.services.keepa_service import (
    KeepaService,
    KeepaTokensExhausted,
    KeepaUnavailable,
    build_price_history,
    keepa_minutes_to_unix_ms,
    parse_product,
)

NOW = datetime(2026, 9, 21, 12, 0, tzinfo=timezone.utc)
API_KEY = "test-keepa-key-1234567890"


def make_product(**overrides):
    avg90 = [-1] * 19
    avg90[0], avg90[18] = 9000, 10000
    csv = [None] * 19
    csv[0] = [0, 5000, 1440, -1, 2880, 4800]      # 2011-01-01 EUR 50.00, 01-02 no offer, 01-03 EUR 48.00
    csv[18] = [2880, 4700, 500]                    # 2011-01-03 BuyBox 47.00 + 5.00 shipping
    product = {
        "title": "  Test Kopfhörer  ",
        "categoryTree": [{"catId": 1, "name": "Elektronik & Foto"}],
        "imagesCSV": "71abc.jpg,72def.jpg",
        "monthlySold": 150,
        "stats": {
            "current": [-1, 3200, -1, 4500],
            "avg90": avg90,
            "buyBoxPrice": 3000,
            "buyBoxSellerId": "A1XYZ",
            "buyBoxIsAmazon": False,
            "buyBoxIsFBA": True,
            "salesRankDrops30": 12,
            "salesRankDrops90": 30,
        },
        "csv": csv,
    }
    product.update(overrides)
    return product


# --- time ----------------------------------------------------------------------

def test_keepa_time_zero_is_new_year_2011_utc():
    assert keepa_minutes_to_unix_ms(0) == 1_293_840_000_000
    assert datetime.fromtimestamp(keepa_minutes_to_unix_ms(0) / 1000, tz=timezone.utc) == datetime(2011, 1, 1, tzinfo=timezone.utc)


def test_keepa_minutes_advance_by_sixty_seconds():
    assert keepa_minutes_to_unix_ms(1440) - keepa_minutes_to_unix_ms(0) == 24 * 3600 * 1000


# --- prices --------------------------------------------------------------------

def test_prices_are_converted_from_cents_and_the_buybox_wins():
    facts = parse_product(make_product(), NOW)
    assert facts.current_price == 30.00 and facts.price_source == "buybox"
    assert facts.reference_price == 100.00 and facts.reference_source == "buybox_avg90"
    assert facts.title == "Test Kopfhörer"


def test_falls_back_to_amazon_then_marketplace_and_flags_the_source():
    stats = make_product()["stats"]
    no_buybox = {**stats, "buyBoxPrice": -2, "current": [2500, 3200, -1, 4500]}
    facts = parse_product(make_product(stats=no_buybox), NOW)
    assert (facts.current_price, facts.price_source) == (25.00, "amazon")

    marketplace_only = {**stats, "buyBoxPrice": -2, "current": [-1, 3200, -1, 4500]}
    facts = parse_product(make_product(stats=marketplace_only), NOW)
    assert (facts.current_price, facts.price_source) == (32.00, "marketplace_new")


def test_reference_price_falls_back_in_order():
    stats = make_product()["stats"]
    avg = [-1] * 19
    avg[0] = 8800
    facts = parse_product(make_product(stats={**stats, "avg90": avg}), NOW)
    assert (facts.reference_price, facts.reference_source) == (88.00, "amazon_avg90")


@pytest.mark.parametrize("bad_price", [-1, -2, 0, None, "12", True])
def test_no_offer_markers_are_not_prices(bad_price):
    stats = {**make_product()["stats"], "buyBoxPrice": bad_price, "current": [bad_price, bad_price, -1, -1]}
    with pytest.raises(KeepaUnavailable, match="no current price"):
        parse_product(make_product(stats=stats), NOW)


def test_missing_reference_price_is_unusable():
    stats = {**make_product()["stats"], "avg90": [-1] * 19}
    with pytest.raises(KeepaUnavailable, match="reference"):
        parse_product(make_product(stats=stats), NOW)


def test_empty_product_is_unusable():
    with pytest.raises(KeepaUnavailable):
        parse_product({}, NOW)


# --- everything else the pipeline uses ------------------------------------------

def test_category_image_seller_and_demand_fields():
    facts = parse_product(make_product(), NOW)
    assert facts.category == "Technology & Electronics"
    assert facts.image_url == "https://m.media-amazon.com/images/I/71abc.jpg"
    assert facts.buybox_seller_label == "Marketplace (A1XYZ)"
    assert facts.buybox_is_fba is True and facts.buybox_is_amazon is False
    assert (facts.monthly_sold, facts.sales_rank, facts.sales_rank_drops_30, facts.sales_rank_drops_90) == (150, 4500, 12, 30)


def test_unknown_category_and_missing_fields_are_handled():
    facts = parse_product(make_product(categoryTree=[], imagesCSV="", monthlySold=None), NOW)
    assert facts.category == "Other"
    assert facts.image_url is None
    assert facts.monthly_sold is None


def test_amazon_as_buybox_seller_and_unknown_seller_labels():
    stats = make_product()["stats"]
    assert parse_product(make_product(stats={**stats, "buyBoxIsAmazon": True}), NOW).buybox_seller_label == "Amazon"
    unknown = {**stats, "buyBoxSellerId": "-2", "buyBoxIsAmazon": None, "buyBoxIsFBA": None}
    assert parse_product(make_product(stats=unknown), NOW).buybox_seller_label == "Unknown"


# --- price history ---------------------------------------------------------------

def test_history_uses_real_points_one_per_day_plus_today():
    facts = parse_product(make_product(), NOW)
    days = [(point["recorded_at"][:10], point["price_amazon"], point["price_buybox"]) for point in facts.price_history]
    assert days == [
        ("2011-01-01", 50.00, None),
        ("2011-01-03", 48.00, 52.00),      # BuyBox includes the 5.00 shipping
        ("2026-09-21", None, 30.00),       # today's point, from the current stats
    ]


def test_without_history_only_todays_point_exists():
    points = build_price_history(None, NOW, today_amazon=None, today_buybox=30.0)
    assert len(points) == 1 and points[0]["price_buybox"] == 30.0
    assert build_price_history(None, NOW, None, None) == []


def test_history_is_capped_and_the_newest_points_are_kept():
    daily = []
    for day in range(200):
        daily += [day * 1440, 1000 + day]
    csv = [daily] + [None] * 18
    points = build_price_history(csv, NOW, today_amazon=None, today_buybox=None)
    assert len(points) == 90
    assert points[-1]["price_amazon"] == 11.99  # day 199


# --- HTTP client -------------------------------------------------------------------

@pytest.fixture
def service(monkeypatch):
    svc = KeepaService()
    svc.api_key = API_KEY

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(asyncio, "sleep", no_sleep)
    return svc


@pytest.fixture
def keepa_api(respx_mock):
    return respx_mock.get(f"{keepa.KEEPA_BASE_URL}/product")


async def test_a_good_answer_is_parsed_and_the_request_asks_for_buybox_data(service, keepa_api):
    route = keepa_api.mock(return_value=httpx.Response(200, json={"tokensLeft": 41, "products": [make_product()]}))
    facts = await service.fetch_facts("B0TEST0001")

    assert facts.current_price == 30.00
    params = route.calls.last.request.url.params
    assert (params["domain"], params["asin"], params["buybox"], params["stats"]) == ("3", "B0TEST0001", "1", "90")
    assert service.tokens_left == 41


async def test_token_exhaustion_reports_when_to_retry(service, keepa_api):
    keepa_api.mock(return_value=httpx.Response(429, json={"tokensLeft": 0, "refillIn": 90_500}))
    with pytest.raises(KeepaTokensExhausted) as caught:
        await service.fetch_facts("B0TEST0001")
    assert caught.value.retry_after_seconds == 91


async def test_rate_limit_without_a_refill_time_uses_the_default(service, keepa_api):
    keepa_api.mock(return_value=httpx.Response(503, text="busy"))
    with pytest.raises(KeepaTokensExhausted) as caught:
        await service.fetch_facts("B0TEST0001")
    assert caught.value.retry_after_seconds == keepa.DEFAULT_RETRY_AFTER_SECONDS


async def test_server_errors_are_retried_a_bounded_number_of_times(service, keepa_api):
    route = keepa_api.mock(return_value=httpx.Response(500, json={}))
    with pytest.raises(KeepaUnavailable, match="3 attempts"):
        await service.fetch_facts("B0TEST0001")
    assert route.call_count == keepa.MAX_ATTEMPTS


async def test_a_rejected_request_is_not_retried(service, keepa_api):
    route = keepa_api.mock(return_value=httpx.Response(400, json={}))
    with pytest.raises(KeepaUnavailable, match="HTTP 400"):
        await service.fetch_facts("B0TEST0001")
    assert route.call_count == 1


async def test_an_answer_without_products_is_unavailable(service, keepa_api):
    keepa_api.mock(return_value=httpx.Response(200, json={"products": []}))
    with pytest.raises(KeepaUnavailable, match="no product"):
        await service.fetch_facts("B0TEST0001")


async def test_network_failure_never_leaks_the_api_key(service, keepa_api):
    keepa_api.mock(side_effect=httpx.ConnectError(f"cannot connect to https://api.keepa.com/product?key={API_KEY}&asin=X"))
    with pytest.raises(KeepaUnavailable) as caught:
        await service.fetch_facts("B0TEST0001")
    assert API_KEY not in str(caught.value)
    assert "ConnectError" in str(caught.value)


async def test_without_a_key_nothing_is_sent(respx_mock):
    svc = KeepaService()
    svc.api_key = None
    with pytest.raises(KeepaUnavailable, match="not configured"):
        await svc.fetch_facts("B0TEST0001")
    assert not respx_mock.calls


def test_the_placeholder_key_from_env_example_counts_as_not_configured():
    svc = KeepaService()
    svc.api_key = "your_keepa_api_key_here"
    assert svc.configured is False


def test_mock_facts_are_clearly_marked_and_have_no_history():
    facts = keepa.mock_facts("B0TEST0001")
    assert facts.title.startswith("[MOCK]")
    assert facts.buybox_seller_label == "MOCK"
    assert facts.price_history == []
