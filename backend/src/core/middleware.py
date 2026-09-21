"""Request-level middleware, written as plain ASGI so background tasks keep their context.

Order matters (outermost first, see main.py):

1. `RequestContextMiddleware`  gives every request an id and logs one line per request.
2. CORS and rate limiting     as before.
3. `UnhandledErrorMiddleware`  sits INSIDE CORS so that even a 500 carries the CORS
   headers; without them the browser reports a network error and hides the message.
"""

import json
import logging
import re
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.core.config import settings
from src.core.logging_config import request_id_var

logger = logging.getLogger("vindera.http")

# A caller-supplied id is only kept when it is harmless to put in a log line.
_SAFE_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{8,64}")
_QUIET_PATHS = ("/healthz", "/readyz", "/metrics")


def _header(scope: Scope, name: bytes) -> str:
    for key, value in scope["headers"]:
        if key == name:
            return value.decode("latin-1")
    return ""


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        supplied = _header(scope, b"x-request-id")
        request_id = supplied if _SAFE_REQUEST_ID.fullmatch(supplied) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status = 500

        async def send_with_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message.setdefault("headers", []).append((b"x-request-id", request_id.encode("latin-1")))
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            # Path only: query strings can carry filters or tokens and are not logged.
            path = scope["path"]
            level = logging.DEBUG if path in _QUIET_PATHS else logging.INFO
            logger.log(
                level, "%s %s -> %d", scope["method"], path, status,
                extra={"fields": {"status": status, "duration_ms": round((time.perf_counter() - started) * 1000, 1)}},
            )
            request_id_var.reset(token)


class UnhandledErrorMiddleware:
    """Turns an unexpected exception into a JSON 500 without a stack trace.

    HTTPExceptions and validation errors are handled by FastAPI further in; only
    genuine bugs reach this point. The full traceback goes to the log (and to
    Sentry when configured), never to the caller.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def send_tracking(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_tracking)
        except Exception as exc:
            logger.exception("Unhandled error on %s %s", scope["method"], scope["path"])
            _report_to_sentry(exc)
            if response_started:
                raise  # Too late to send a clean answer; let the server close the connection.
            body: dict[str, str] = {"detail": "Internal server error."}
            request_id = request_id_var.get()
            if request_id:
                body["request_id"] = request_id
            if not settings.is_production:
                body["error"] = type(exc).__name__
            payload = json.dumps(body).encode()
            await send({
                "type": "http.response.start",
                "status": 500,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode())],
            })
            await send({"type": "http.response.body", "body": payload})


def _report_to_sentry(exc: Exception) -> None:
    """Sentry's own integration cannot see an exception this middleware swallows."""
    try:
        import sentry_sdk

        if sentry_sdk.is_initialized():
            sentry_sdk.capture_exception(exc)
    except Exception:  # Reporting must never mask the original error.
        logger.debug("Could not report the exception to Sentry", exc_info=True)
