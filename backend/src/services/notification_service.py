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

    async def send_dead_stock_alert(self, items: list[dict], threshold_days: int) -> bool:
        """Send one digest push for items that have tied up capital too long.

        Each item needs `title`, `buy_price` and `age_days`. Returns True only
        when Pushover accepted the message, so the caller can leave items
        un-notified (and retry on the next run) if credentials are missing or
        the request fails.
        """
        if not items:
            return False

        if not self.user_key or not self.api_token:
            print("Pushover credentials missing. Skipping dead-stock notification.")
            return False

        header = f"{len(items)} item{'s' if len(items) != 1 else ''} tied up capital for more than {threshold_days} days:\n"
        lines: list[str] = []
        length = len(header)
        for item in items:
            line = f"• {item['title'][:60]} · €{item['buy_price']} · {item['age_days']}d"
            # Pushover rejects messages over 1024 chars; keep room for the "+N more" line.
            if length + len(line) + 1 > 950:
                break
            lines.append(line)
            length += len(line) + 1

        message = header + "\n".join(lines)
        if len(lines) < len(items):
            message += f"\n+{len(items) - len(lines)} more"

        payload = {
            "token": self.api_token,
            "user": self.user_key,
            "title": "Vindera Dead Stock",
            "message": message,
            "priority": 0,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(self.url, data=payload)
        except Exception as e:
            print(f"Error sending dead-stock notification: {str(e)}")
            return False

        if response.status_code != 200:
            print(f"❌ Failed to send dead-stock notification: {response.text}")
            return False

        print("✅ Dead-stock notification sent successfully!")
        return True

notification_service = NotificationService()