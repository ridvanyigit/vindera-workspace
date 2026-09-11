import httpx
from src.core.config import settings
from typing import Dict, Any, Optional

class KeepaService:
    def __init__(self):
        self.base_url = "https://api.keepa.com"
        self.api_key = settings.KEEPA_API_KEY.get_secret_value() if settings.KEEPA_API_KEY else None

    async def fetch_product_data(self, asin: str, domain: int = 3) -> Optional[Dict[str, Any]]:
        """
        Fetches product details and price history from Keepa.
        Domain 3 = Amazon.de (Germany/Austria)
        """
        if not self.api_key or self.api_key == "your_keepa_api_key_here":
            print("⚠️ WARNING: Keepa API key is missing or invalid.")
            return None

        url = f"{self.base_url}/product"
        params = {
            "key": self.api_key,
            "domain": domain,
            "asin": asin,
            "stats": 1, # Includes historical averages
            "days": 90, # Look at the last 90 days
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=30.0)
                if response.status_code == 200:
                    data = response.json()
                    if "products" in data and len(data["products"]) > 0:
                        return data["products"][0]
                else:
                    print(f"Keepa API Error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Exception during Keepa API call: {str(e)}")
            
        return None

    def extract_price_info(self, keepa_product: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parses the complex Keepa response to extract title, current price, and 90-day average.
        Keepa returns prices as integers (e.g., 1999 means 19.99 Euro).
        """
        try:
            title = keepa_product.get("title", "Unknown Product")
            stats = keepa_product.get("stats", {})
            
            # Keepa CSV index 0 is Amazon price, index 1 is New Marketplace price. We check Amazon first.
            current_price_int = stats.get("current", [])[0]
            avg_90_price_int = stats.get("avg90", [])[0]
            
            # Fallback if Amazon is out of stock (value is -1)
            if current_price_int == -1:
                current_price_int = stats.get("current", [])[1] # Try 3rd party New
            if avg_90_price_int == -1:
                avg_90_price_int = stats.get("avg90", [])[1]

            return {
                "title": title,
                "current_price": current_price_int / 100.0 if current_price_int > 0 else 0.0,
                "average_historical_price": avg_90_price_int / 100.0 if avg_90_price_int > 0 else 0.0
            }
        except Exception as e:
            print(f"Error parsing Keepa data: {str(e)}")
            return {"title": "Error", "current_price": 0.0, "average_historical_price": 0.0}

keepa_service = KeepaService()