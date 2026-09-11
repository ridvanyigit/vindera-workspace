import httpx
from src.core.config import settings

class NotificationService:
    def __init__(self):
        self.url = "https://api.pushover.net/1/messages.json"
        self.user_key = settings.PUSHOVER_USER_KEY.get_secret_value() if settings.PUSHOVER_USER_KEY else None
        self.api_token = settings.PUSHOVER_API_TOKEN.get_secret_value() if settings.PUSHOVER_API_TOKEN else None

    async def send_deal_alert(self, product_title: str, buy_price: float, profit_margin: float, amazon_url: str):
        """Sends a push notification when a profitable deal is found."""
        if not self.user_key or not self.api_token:
            print("Pushover credentials missing. Skipping notification.")
            return

        message = (
            f"🔥 PROFITABLE DEAL FOUND! 🔥\n\n"
            f"Product: {product_title}\n"
            f"Buy Price: €{buy_price}\n"
            f"Estimated Margin: {profit_margin}%\n\n"
            f"Link: {amazon_url}"
        )

        payload = {
            "token": self.api_token,
            "user": self.user_key,
            "title": "Vindera Arbitrage Alert",
            "message": message,
            "url": amazon_url,
            "url_title": "Buy on Amazon",
            "priority": 1 # High priority
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(self.url, data=payload)
                if response.status_code == 200:
                    print("✅ Notification sent successfully!")
                else:
                    print(f"❌ Failed to send notification: {response.text}")
        except Exception as e:
            print(f"Error sending notification: {str(e)}")

notification_service = NotificationService()