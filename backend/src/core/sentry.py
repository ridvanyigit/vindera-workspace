"""Optional Sentry error tracking. Does nothing unless SENTRY_DSN is set."""

import logging
from typing import Any

from src.core.config import settings

logger = logging.getLogger("vindera.sentry")

# Headers and fields that can hold credentials or personal data.
_SCRUBBED_HEADERS = {"authorization", "cookie", "x-vindera-key", "x-api-key", "proxy-authorization"}


def _scrub(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Remove credentials and request contents from an event before it leaves the process."""
    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = {k: ("***" if k.lower() in _SCRUBBED_HEADERS else v) for k, v in headers.items()}
        for field in ("cookies", "data", "query_string"):
            request.pop(field, None)
    event.pop("user", None)
    return event


def init_sentry() -> bool:
    """Start Sentry when a DSN is configured. Returns whether it is active."""
    dsn = settings.SENTRY_DSN.get_secret_value().strip() if settings.SENTRY_DSN else ""
    if not dsn:
        return False

    import sentry_sdk

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.ENVIRONMENT,
        send_default_pii=False,
        max_request_body_size="never",
        traces_sample_rate=0.0,
        before_send=_scrub,
    )
    logger.info("Sentry error tracking is active")
    return True
