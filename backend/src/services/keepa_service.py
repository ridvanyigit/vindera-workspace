import httpx
from typing import Any, Dict, Optional

from src.core.categories import map_to_canonical_category
from src.core.config import settings

# Keepa price indices inside the `stats` arrays.
AMAZON_PRICE_INDEX = 0
NEW_MARKETPLACE_PRICE_INDEX = 1

# Keepa reports "no data" / "out of stock" as -1.
KEEPA_NO_DATA = -1


class KeepaService:
    """Thin client around the Keepa product API plus a parser for its payload."""

    def __init__(self):
        self.base_url = "https://api.keepa.com"
        self.api_key = settings.KEEPA_API_KEY.get_secret_value() if settings.KEEPA_API_KEY else None

    async def fetch_product_data(self, asin: str, domain: int = 3) -> Optional[Dict[str, Any]]:
        """Fetch product details and price history from Keepa.

        Domain 3 = Amazon.de (serves Germany and Austria).
        Returns `None` when the key is missing or the call fails, which signals
        the caller to fall back to mock data.
        """
        if not self.api_key or self.api_key == "your_keepa_api_key_here":
            print("⚠️ WARNING: Keepa API key is missing or invalid.")
            return None

        url = f"{self.base_url}/product"
        params = {
            "key": self.api_key,
            "domain": domain,
            "asin": asin,
            "stats": 1,  # Include historical averages
            "days": 90,  # Look at the last 90 days
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=30.0)
                if response.status_code == 200:
                    data = response.json()
                    products = data.get("products") or []
                    if products:
                        return products[0]
                    print(f"Keepa returned no product for ASIN {asin}.")
                else:
                    print(f"Keepa API Error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Exception during Keepa API call: {str(e)}")

        return None

    def extract_price_info(self, keepa_product: Dict[str, Any]) -> Dict[str, Any]:
        """Parse a Keepa product payload into the fields the pipeline needs.

        Keepa expresses prices as integer cents (1999 -> €19.99) and uses -1 for
        missing values, so the Amazon index falls back to the third-party New
        index before giving up.
        """
        try:
            title = keepa_product.get("title") or "Unknown Product"
            stats = keepa_product.get("stats") or {}

            current_price_cents = self._pick_price(stats.get("current"))
            avg_90_price_cents = self._pick_price(stats.get("avg90"))

            return {
                "title": title,
                "category": self._extract_category(keepa_product),
                "current_price": self._to_euro(current_price_cents),
                "average_historical_price": self._to_euro(avg_90_price_cents),
            }
        except Exception as e:
            print(f"Error parsing Keepa data: {str(e)}")
            return {
                "title": "Unknown Product",
                "category": map_to_canonical_category(None),
                "current_price": 0.0,
                "average_historical_price": 0.0,
            }

    @staticmethod
    def _pick_price(price_array: Any) -> int:
        """Return the Amazon price, falling back to the third-party New price."""
        if not isinstance(price_array, list):
            return KEEPA_NO_DATA

        for index in (AMAZON_PRICE_INDEX, NEW_MARKETPLACE_PRICE_INDEX):
            if len(price_array) > index and price_array[index] > 0:
                return price_array[index]

        return KEEPA_NO_DATA

    @staticmethod
    def _to_euro(price_cents: int) -> float:
        return price_cents / 100.0 if price_cents > 0 else 0.0

    @staticmethod
    def _extract_category(keepa_product: Dict[str, Any]) -> str:
        """Map Keepa's category tree onto the app's canonical categories."""
        category_tree = keepa_product.get("categoryTree") or []
        raw_name = category_tree[0].get("name") if category_tree else None
        return map_to_canonical_category(raw_name)


keepa_service = KeepaService()
