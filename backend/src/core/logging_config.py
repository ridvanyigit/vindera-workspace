"""Structured logging: one JSON object per line on stdout.

Every record carries the id of the request it belongs to (see
`core.middleware.RequestContextMiddleware`; background scans started from a
request inherit it). Secrets never reach the log: the configured API keys and
tokens are masked by value, and obvious credential shapes (`key=...`,
`Bearer ...`) by pattern. Request bodies and tokens are not logged at all; the
masking is a safety net for library messages, for example an HTTP error that
quotes its URL.
"""

import json
import logging
import re
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

from src.core.config import settings

# Set by the request middleware; None outside a request (startup, jobs).
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

_CREDENTIAL_PATTERNS = (
    (re.compile(r"(?i)\b(key|api_key|apikey|token|access_token|secret|password)=[^&\s'\"]+"), r"\1=***"),
    (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+"), "Bearer ***"),
)
_MIN_SECRET_LENGTH = 8

# Libraries that log full request URLs at INFO (the Keepa key travels in the query string).
_QUIET_LOGGERS = ("httpx", "httpx2", "httpcore", "httpcore2", "hpack", "openai._base_client", "sentry_sdk.errors")


def _configured_secrets() -> list[str]:
    values = []
    for name in (
        "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "KEEPA_API_KEY", "PUSHOVER_USER_KEY",
        "PUSHOVER_API_TOKEN", "AUTOMATION_SHARED_SECRET", "METRICS_TOKEN", "SENTRY_DSN",
    ):
        secret = getattr(settings, name, None)
        value = secret.get_secret_value().strip() if secret is not None else ""
        if len(value) >= _MIN_SECRET_LENGTH:
            values.append(value)
    return values


def redact(text: str, secrets: list[str] | None = None) -> str:
    """Mask configured secret values and credential-looking fragments."""
    for value in secrets if secrets is not None else _configured_secrets():
        text = text.replace(value, "***")
    for pattern, replacement in _CREDENTIAL_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


class JsonFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__()
        self._secrets = _configured_secrets()

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": redact(record.getMessage(), self._secrets),
        }
        request_id = request_id_var.get()
        if request_id:
            entry["request_id"] = request_id
        # Extra fields passed as `extra={"fields": {...}}` (already free of personal data by convention).
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            entry.update(fields)
        if record.exc_info:
            entry["exc"] = redact(self.formatException(record.exc_info), self._secrets)
        return json.dumps(entry, ensure_ascii=False, default=str)


def configure_logging() -> None:
    """Send every log record, including uvicorn's, through the JSON formatter."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(settings.LOG_LEVEL)

    for name in ("uvicorn", "uvicorn.error"):
        logger = logging.getLogger(name)
        logger.handlers[:] = []
        logger.propagate = True
    # Requests are logged once, with their id, by the request middleware.
    access = logging.getLogger("uvicorn.access")
    access.handlers[:] = []
    access.propagate = False

    for name in _QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
