import httpx
from src.core.config import settings

class KeepaService:
    def __init__(self):
        self.base_url = "https://api.keepa.com"
        self.api_key = settings.KEEPA_API_KEY.get_secret_value() if settings.KEEPA_API_KEY else None

    async def check_connection(self) -> bool:
        """Checks if the Keepa API key is valid and working."""
        if not self.api_key:
            return False
            
        # We will implement the actual Keepa API call here later
        return True

    async def search_amazon_products(self, keyword: str, domain: int = 3):
        """
        domain=3 represents Amazon.de (Germany/Austria)
        We will expand this to IT, FR, PL etc. later.
        """
        pass

keepa_service = KeepaService()