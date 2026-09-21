"""Keepa client and parser.

Field names and layouts were taken from Keepa's official Java client
(github.com/keepacom/api_backend: `Product.java`, `Stats.java`, `KeepaTime.java`,
`Request.java`, `Response.java`) and cross-checked against the `keepa` Python
package 1.5.0 (`utils.py`, `constants.py`):

  * Product request parameters used: `domain` (3 = Amazon.de), `asin`, `stats`,
    `buybox=1` (adds the BuyBox data to the product and its stats), `history`, `days`.
  * `product.csv[i]` is `[keepaTime, price, keepaTime, price, ...]`; the *_SHIPPING
    types (index 18 = BUY_BOX_SHIPPING) are triples `[keepaTime, price, shipping, ...]`.
    Prices are integer cents, -1 = no offer. Index 0 = AMAZON, 1 = NEW (3rd party).
  * Keepa time is minutes; `unix_ms = (keepa_minutes + 21564000) * 60000`
    (21564000 minutes = 2011-01-01 UTC, `KeepaTime.keepaStartMinute`).
  * `stats.current` / `stats.avg90` use the same csv indexing. `stats.buyBoxPrice`
    (-2 if none), `buyBoxSellerId`, `buyBoxIsAmazon`, `buyBoxIsFBA`,
    `salesRankDrops30/90`; `product.monthlySold` (null if unknown).
  * Response: `tokensLeft`, `refillIn` (ms). Running out of tokens answers with
    HTTP 429 (keepa package: NOT_ENOUGH_TOKEN); the Java docs also mention 503 for
    throttling. Both are treated as "tokens exhausted".

The Keepa key travels as a query parameter, so no exception text or log line may
ever contain the request URL.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx

from src.core.categories import map_to_canonical_category
from src.core.config import settings

logger = logging.getLogger(__name__)

KEEPA_BASE_URL = "https://api.keepa.com"
DOMAIN_DE = 3  # Amazon.de serves Germany and Austria

# `Product.CsvType` indices.
CSV_AMAZON = 0
CSV_NEW = 1
CSV_SALES_RANK = 3
CSV_BUY_BOX_SHIPPING = 18

KEEPA_START_MINUTE = 21_564_000  # KeepaTime.keepaStartMinute
HISTORY_DAYS = 90
MAX_HISTORY_POINTS = 90

REQUEST_TIMEOUT_SECONDS = 30.0
MAX_ATTEMPTS = 3  # for network errors and 5xx answers
DEFAULT_RETRY_AFTER_SECONDS = 60


class KeepaUnavailable(Exception):
    """Keepa could not deliver usable data (no key, network, bad answer, no price)."""


class KeepaTokensExhausted(KeepaUnavailable):
    """The token contingent is depleted; `retry_after_seconds` says when to try again."""

    def __init__(self, retry_after_seconds: int):
        super().__init__(f"Keepa tokens exhausted; retry in about {retry_after_seconds} s")
        self.retry_after_seconds = retry_after_seconds


@dataclass
class KeepaFacts:
    """Everything the scan pipeline needs from one Keepa product, in euros."""

    title: str
    category: str
    image_url: str | None
    # Price the owner would pay today, and where it came from:
    # 'buybox' | 'amazon' | 'marketplace_new' (3rd party, flagged as riskier).
    current_price: float
    price_source: str
    # 90-day reference price and its source:
    # 'buybox_avg90' | 'amazon_avg90' | 'marketplace_new_avg90'.
    reference_price: float
    reference_source: str
    buybox_seller_id: str | None = None
    buybox_is_amazon: bool | None = None
    buybox_is_fba: bool | None = None
    monthly_sold: int | None = None
    sales_rank: int | None = None
    sales_rank_drops_30: int | None = None
    sales_rank_drops_90: int | None = None
    # [{recorded_at (ISO UTC), price_amazon, price_buybox}] real points only.
    price_history: list[dict[str, Any]] = field(default_factory=list)
    is_mock: bool = False

    @property
    def buybox_seller_label(self) -> str:
        if self.is_mock:
            return "MOCK"
        if self.buybox_is_amazon:
            return "Amazon"
        if self.buybox_seller_id:
            return f"Marketplace ({self.buybox_seller_id})"
        return "Unknown"


def keepa_minutes_to_unix_ms(keepa_minutes: int) -> int:
    return (keepa_minutes + KEEPA_START_MINUTE) * 60_000


def _cents_to_euro(value: Any) -> float | None:
    """Keepa cents -> euros; anything missing or <= 0 (-1 no offer, -2 none) -> None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        return None
    return round(value / 100.0, 2)


def _index(values: Any, position: int) -> Any:
    return values[position] if isinstance(values, list) and len(values) > position else None


def _series(csv_row: Any, step: int) -> list[tuple[int, float | None]]:
    """[(unix_ms, euro or None)] from one csv row (`step` 2 = pairs, 3 = price/shipping triples)."""
    if not isinstance(csv_row, list):
        return []
    points: list[tuple[int, float | None]] = []
    for i in range(0, len(csv_row) - (step - 1), step):
        minutes, price = csv_row[i], csv_row[i + 1]
        if not isinstance(minutes, int) or not isinstance(price, int):
            continue
        if price < 0:
            euro = None  # no offer at that time
        else:
            shipping = csv_row[i + 2] if step == 3 and isinstance(csv_row[i + 2], int) and csv_row[i + 2] > 0 else 0
            euro = round((price + shipping) / 100.0, 2)
        points.append((keepa_minutes_to_unix_ms(minutes), euro))
    return points


def build_price_history(
    csv: Any, now: datetime, today_amazon: float | None, today_buybox: float | None
) -> list[dict[str, Any]]:
    """Real Keepa price points, one per UTC day (the day's last value), plus today's point.

    Keepa stores changes only, so a stable price yields few points; nothing is
    interpolated or invented. Without any history the result is just today's point.
    """
    amazon = _series(_index(csv, CSV_AMAZON), 2)
    buybox = _series(_index(csv, CSV_BUY_BOX_SHIPPING), 3)

    days: dict[str, dict[str, Any]] = {}
    for column, series in (("price_amazon", amazon), ("price_buybox", buybox)):
        for unix_ms, euro in series:
            moment = datetime.fromtimestamp(unix_ms / 1000, tz=timezone.utc)
            day = days.setdefault(moment.date().isoformat(), {"at": moment, "price_amazon": None, "price_buybox": None})
            if moment >= day["at"]:
                day["at"] = moment
            day[column] = euro

    points = [
        {"recorded_at": d["at"].isoformat(), "price_amazon": d["price_amazon"], "price_buybox": d["price_buybox"]}
        for _, d in sorted(days.items())
        if d["price_amazon"] is not None or d["price_buybox"] is not None
    ][-MAX_HISTORY_POINTS:]

    if today_amazon is not None or today_buybox is not None:
        points.append({
            "recorded_at": now.replace(microsecond=0).isoformat(),
            "price_amazon": today_amazon,
            "price_buybox": today_buybox,
        })
    return points


def parse_product(product: dict[str, Any], now: datetime | None = None) -> KeepaFacts:
    """Turn a Keepa product object into `KeepaFacts`, or raise `KeepaUnavailable` if it has no usable price."""
    now = now or datetime.now(timezone.utc)
    stats = product.get("stats") or {}
    current = stats.get("current")
    avg90 = stats.get("avg90")

    amazon_now = _cents_to_euro(_index(current, CSV_AMAZON))
    new_now = _cents_to_euro(_index(current, CSV_NEW))
    buybox_now = _cents_to_euro(stats.get("buyBoxPrice"))

    if buybox_now is not None:
        current_price, price_source = buybox_now, "buybox"
    elif amazon_now is not None:
        current_price, price_source = amazon_now, "amazon"
    elif new_now is not None:
        current_price, price_source = new_now, "marketplace_new"
    else:
        raise KeepaUnavailable("Keepa returned no current price for this product")

    reference_candidates = (
        (_cents_to_euro(_index(avg90, CSV_BUY_BOX_SHIPPING)), "buybox_avg90"),
        (_cents_to_euro(_index(avg90, CSV_AMAZON)), "amazon_avg90"),
        (_cents_to_euro(_index(avg90, CSV_NEW)), "marketplace_new_avg90"),
    )
    reference = next(((price, source) for price, source in reference_candidates if price is not None), None)
    if reference is None:
        raise KeepaUnavailable("Keepa returned no 90-day reference price for this product")

    category_tree = product.get("categoryTree") or []
    raw_category = category_tree[0].get("name") if category_tree and isinstance(category_tree[0], dict) else None

    images = (product.get("imagesCSV") or "").split(",")
    image_name = images[0].strip() if images else ""

    seller_id = stats.get("buyBoxSellerId")
    monthly_sold = product.get("monthlySold")
    sales_rank = _index(current, CSV_SALES_RANK)

    return KeepaFacts(
        title=(product.get("title") or "Unknown Product").strip(),
        category=map_to_canonical_category(raw_category),
        image_url=f"https://m.media-amazon.com/images/I/{image_name}" if image_name else None,
        current_price=current_price,
        price_source=price_source,
        reference_price=reference[0],
        reference_source=reference[1],
        buybox_seller_id=seller_id if isinstance(seller_id, str) and seller_id not in ("", "-2") else None,
        buybox_is_amazon=stats.get("buyBoxIsAmazon") if isinstance(stats.get("buyBoxIsAmazon"), bool) else None,
        buybox_is_fba=stats.get("buyBoxIsFBA") if isinstance(stats.get("buyBoxIsFBA"), bool) else None,
        monthly_sold=monthly_sold if isinstance(monthly_sold, int) and monthly_sold >= 0 else None,
        sales_rank=sales_rank if isinstance(sales_rank, int) and sales_rank > 0 else None,
        sales_rank_drops_30=_non_negative_int(stats.get("salesRankDrops30")),
        sales_rank_drops_90=_non_negative_int(stats.get("salesRankDrops90")),
        price_history=build_price_history(product.get("csv"), now, amazon_now, buybox_now),
    )


def _non_negative_int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


class KeepaService:
    def __init__(self) -> None:
        self.api_key = settings.KEEPA_API_KEY.get_secret_value() if settings.KEEPA_API_KEY else None
        # Last values reported by Keepa, kept for monitoring (Phase 6.6).
        self.tokens_left: int | None = None
        self.refill_in_ms: int | None = None

    @property
    def configured(self) -> bool:
        return bool(self.api_key) and self.api_key != "your_keepa_api_key_here"

    async def fetch_facts(self, asin: str) -> KeepaFacts:
        """Fetch and parse one product. Raises `KeepaUnavailable` / `KeepaTokensExhausted`."""
        product = await self._fetch_product(asin)
        return parse_product(product)

    async def _fetch_product(self, asin: str) -> dict[str, Any]:
        if not self.configured:
            raise KeepaUnavailable("Keepa API key is not configured")

        params = {
            "key": self.api_key,
            "domain": DOMAIN_DE,
            "asin": asin,
            "stats": HISTORY_DAYS,
            "history": 1,
            "buybox": 1,
            "days": HISTORY_DAYS,
        }

        last_problem = "unknown error"
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                    response = await client.get(f"{KEEPA_BASE_URL}/product", params=params)
            except httpx.HTTPError as e:
                # Only the exception type: its text may contain the request URL and with it the key.
                last_problem = f"network error ({type(e).__name__})"
            else:
                body = self._json(response)
                self._remember_tokens(body)

                if response.status_code in (429, 503):
                    raise KeepaTokensExhausted(self._retry_after_seconds(body))
                if response.status_code == 200:
                    products = body.get("products")
                    if isinstance(products, list) and products:
                        return products[0]
                    raise KeepaUnavailable("Keepa returned no product for this ASIN")
                if response.status_code < 500:
                    raise KeepaUnavailable(f"Keepa rejected the request (HTTP {response.status_code})")
                last_problem = f"Keepa server error (HTTP {response.status_code})"

            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(2 ** (attempt - 1))  # 1 s, 2 s

        raise KeepaUnavailable(f"Keepa unreachable after {MAX_ATTEMPTS} attempts: {last_problem}")

    @staticmethod
    def _json(response: httpx.Response) -> dict[str, Any]:
        try:
            data = response.json()
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}

    def _remember_tokens(self, body: dict[str, Any]) -> None:
        if isinstance(body.get("tokensLeft"), int):
            self.tokens_left = body["tokensLeft"]
        if isinstance(body.get("refillIn"), int):
            self.refill_in_ms = body["refillIn"]

    @staticmethod
    def _retry_after_seconds(body: dict[str, Any]) -> int:
        refill_ms = body.get("refillIn")
        if isinstance(refill_ms, int) and refill_ms > 0:
            return max(1, -(-refill_ms // 1000))
        return DEFAULT_RETRY_AFTER_SECONDS


def mock_facts(asin: str) -> KeepaFacts:
    """Development stand-in (ALLOW_MOCK_DATA only): clearly marked, no price history."""
    return KeepaFacts(
        title=f"[MOCK] Test Product for ASIN: {asin}",
        category=map_to_canonical_category(None),
        image_url=None,
        current_price=45.0,
        price_source="buybox",
        reference_price=99.0,
        reference_source="buybox_avg90",
        is_mock=True,
    )


keepa_service = KeepaService()
