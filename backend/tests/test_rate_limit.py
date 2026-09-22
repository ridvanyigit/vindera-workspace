"""Default (120/min) and shared application (300/min) rate limits (F-MAJOR-1).

Only the per-route `@limiter.limit(...)` decorators (chat, scan) used to have any
effect: `SlowAPIMiddleware`'s own route lookup can't see through the
`_IncludedRouter` wrapper FastAPI 0.141 puts around every `include_router`-ed
route, so it always thought "no handler for this route" and slowapi's own
`_should_exempt` reads "no handler" as "exempt from rate limiting" - default and
application limits silently never fired on any route reached that way. These
tests exercise `ApplicationRateLimitMiddleware` (src/core/rate_limit.py), which
fixes the lookup, and only pass with that fix in place.
"""

from fastapi.testclient import TestClient

from src.main import app


def test_the_default_limit_returns_429_after_120_requests_per_minute():
    client = TestClient(app)
    statuses = [client.get("/healthz").status_code for _ in range(121)]
    assert statuses[:120] == [200] * 120
    assert statuses[120] == 429


def test_the_shared_application_limit_bites_across_different_routes_too():
    """300/minute total, even split across 3 routes that individually stay under
    their own 120/minute default (100 each) - so only the shared budget explains
    the 301st request failing."""
    client = TestClient(app)
    routes = ["/healthz", "/readyz", "/openapi.json"]
    for route in routes:
        for _ in range(100):
            assert client.get(route).status_code != 429

    assert client.get("/healthz").status_code == 429
