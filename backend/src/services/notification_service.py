import asyncio
import logging
from datetime import date, datetime, timezone

import httpx

from src.core.config import settings

logger = logging.getLogger(__name__)

PUSHOVER_URL = "https://api.pushover.net/1/messages.json"
REQUEST_TIMEOUT_SECONDS = 10.0
MAX_ATTEMPTS = 3  # network errors and 5xx answers only; a 4xx means the message itself is wrong


class NotificationService:
    def __init__(self):
        self.url = PUSHOVER_URL
        self.user_key = settings.PUSHOVER_USER_KEY.get_secret_value() if settings.PUSHOVER_USER_KEY else None
        self.api_token = settings.PUSHOVER_API_TOKEN.get_secret_value() if settings.PUSHOVER_API_TOKEN else None
        # Day (UTC) on which the "Keepa tokens exhausted" push was last sent.
        # In memory: a restart may repeat it once, which is acceptable.
        self._tokens_alert_day: date | None = None

    @property
    def configured(self) -> bool:
        return bool(self.user_key and self.api_token)

    async def _send(self, payload: dict) -> bool:
        """POST to Pushover with a timeout and bounded retries. True only when accepted."""
        body = {"token": self.api_token, "user": self.user_key, **payload}
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                    response = await client.post(self.url, data=body)
            except httpx.HTTPError as e:
                logger.warning("Pushover request failed (%s), attempt %d/%d", type(e).__name__, attempt, MAX_ATTEMPTS)
            else:
                if response.status_code == 200:
                    return True
                logger.warning("Pushover rejected the message: HTTP %d", response.status_code)
                if response.status_code < 500:
                    return False
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(2 ** (attempt - 1))
        return False

    async def send_deal_alert(
        self, product_title: str, buy_price: float, net_profit: float, net_margin_pct: float, amazon_url: str
    ) -> bool:
        """Push for an exceptional deal. Returns True only when Pushover accepted it."""
        if not self.configured:
            logger.info("Pushover credentials missing; skipping deal notification")
            return False

        message = (
            f"Product: {product_title}\n"
            f"Buy price: EUR {buy_price:.2f}\n"
            f"Estimated net profit: EUR {net_profit:.2f} ({net_margin_pct:.1f}% on cost)\n\n"
            f"Link: {amazon_url}"
        )
        sent = await self._send({
            "title": "Vindera Deal Alert",
            "message": message,
            "url": amazon_url,
            "url_title": "Open on Amazon",
            "priority": 1,  # High priority
        })
        if sent:
            logger.info("Deal notification sent")
        return sent

    async def send_keepa_tokens_exhausted(self, retry_after_seconds: int) -> bool:
        """At most one push per day, however many ASINs hit the limit. True when a push was sent."""
        today = datetime.now(timezone.utc).date()
        if self._tokens_alert_day == today:
            return False
        if not self.configured:
            return False

        minutes = max(1, round(retry_after_seconds / 60))
        sent = await self._send({
            "title": "Vindera: Keepa tokens exhausted",
            "message": f"Scans are failing because the Keepa token budget is used up. Tokens refill in about {minutes} min. See the scan list in the admin dashboard.",
            "priority": 0,
        })
        if sent:
            self._tokens_alert_day = today
        return sent

    async def _send_digest(self, title: str, header: str, lines: list[str]) -> bool:
        """One push listing `lines` under `header`, cut to Pushover's message limit."""
        kept: list[str] = []
        length = len(header)
        for line in lines:
            # Pushover rejects messages over 1024 chars; keep room for the "+N more" line.
            if length + len(line) + 1 > 950:
                break
            kept.append(line)
            length += len(line) + 1

        message = header + "\n".join(kept)
        if len(kept) < len(lines):
            message += f"\n+{len(lines) - len(kept)} more"
        return await self._send({"title": title, "message": message, "priority": 0})

    async def send_dead_stock_alert(self, items: list[dict], threshold_days: int) -> bool:
        """Send one digest push for items that have tied up capital too long.

        Each item needs `title`, `buy_price` and `age_days`. Returns True only
        when Pushover accepted the message, so the caller can leave items
        un-notified (and retry on the next run) if credentials are missing or
        the request fails.
        """
        if not items:
            return False

        if not self.configured:
            logger.info("Pushover credentials missing; skipping dead-stock notification")
            return False

        header = f"{len(items)} item{'s' if len(items) != 1 else ''} tied up capital for more than {threshold_days} days:\n"
        lines = [f"• {item['title'][:60]} · €{item['buy_price']} · {item['age_days']}d" for item in items]
        sent = await self._send_digest("Vindera Dead Stock", header, lines)
        if sent:
            logger.info("Dead-stock notification sent")
        return sent

    async def send_return_deadline_alert(self, items: list[dict]) -> bool:
        """One digest push for units whose Amazon return window closes soon.

        Each item needs `title`, `return_by` (ISO date) and `days_left`.
        """
        if not items:
            return False

        if not self.configured:
            logger.info("Pushover credentials missing; skipping return-deadline notification")
            return False

        header = "Unsold items can still go back to Amazon, but not for long:\n"
        lines = [
            f"• {item['title'][:60]} · back by {item['return_by']} ({item['days_left']}d)" for item in items
        ]
        sent = await self._send_digest("Vindera Return Deadline", header, lines)
        if sent:
            logger.info("Return-deadline notification sent")
        return sent


notification_service = NotificationService()
