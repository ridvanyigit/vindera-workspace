"""Request rate limiting (slowapi).

`limiter` carries the default budget for every route. Expensive endpoints
tighten it with `@limiter.limit("...")`; those handlers must accept a
`request: Request` argument, as slowapi requires.

A decorated limit runs inside the handler, i.e. after authentication. To keep a
flood of bad tokens from reaching Supabase on those routes, `APPLICATION_LIMIT`
is a shared per-IP budget that `ApplicationRateLimitMiddleware` enforces before
anything else.

Counters are per client IP and per worker process. Behind a reverse proxy,
start uvicorn with `--proxy-headers` so the real client IP is used.
"""

from typing import Callable, List, Optional

from fastapi import FastAPI
from slowapi import Limiter
from slowapi.middleware import _should_exempt, sync_check_limits
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import BaseRoute, Match, Route
from starlette.types import Scope

DEFAULT_LIMIT = "120/minute"
CHAT_LIMIT = "20/minute"
SCAN_LIMIT = "30/minute"
APPLICATION_LIMIT = "300/minute"

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[DEFAULT_LIMIT],
    application_limits=[APPLICATION_LIMIT],
)

_flattened_routes_cache: dict[int, List[BaseRoute]] = {}


def _flatten_routes(app: FastAPI) -> List[BaseRoute]:
    """Rebuild a flat, matchable route list for slowapi's handler lookup.

    FastAPI 0.141 wraps every router added through `include_router` in an
    opaque `_IncludedRouter` object that has no `.matches()`/`.endpoint`.
    slowapi's own lookup (`SlowAPIMiddleware`'s `_find_route_handler`) walks
    `app.routes` looking for exactly those two attributes, silently treats
    every wrapped route as "no handler found", and `_should_exempt` then reads
    "no handler" as "exempt from rate limiting" - so `default_limits` and
    `application_limits` never fired on any route added that way (i.e.
    everything except the dev-only docs routes and `/metrics`, which are
    attached directly and not through `include_router`).

    `core.auth._iter_api_routes` already knows how to unwrap the same
    wrappers for the startup auth-coverage check; reuse it here and rebuild a
    plain `starlette.routing.Route` per endpoint (with the full, prefixed
    path), which does have a working `.matches()`. Cached per app instance:
    the route table is fixed once the app finishes importing.
    """
    from src.core.auth import _iter_api_routes

    cached = _flattened_routes_cache.get(id(app))
    if cached is not None:
        return cached

    flattened: List[BaseRoute] = [route for route in app.routes if not hasattr(route, "original_router")]
    for full_path, route in _iter_api_routes(app.routes):
        flattened.append(Route(full_path, endpoint=route.endpoint, methods=sorted(route.methods or [])))

    _flattened_routes_cache[id(app)] = flattened
    return flattened


def _find_route_handler(routes: List[BaseRoute], scope: Scope) -> Optional[Callable]:
    """`slowapi.middleware._find_route_handler`, over an already-flat route list."""
    handler = None
    for route in routes:
        match, _ = route.matches(scope)
        if match == Match.FULL and hasattr(route, "endpoint"):
            handler = route.endpoint
    return handler


class ApplicationRateLimitMiddleware(BaseHTTPMiddleware):
    """`SlowAPIMiddleware`, but with a route lookup that sees through `_IncludedRouter`.

    Limit evaluation, the 429 response and header injection are all slowapi's
    own (`_should_exempt`, `sync_check_limits`); only the endpoint lookup that
    feeds them is fixed, so per-route `@limiter.limit(...)` decorators keep
    working exactly as before.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        app = request.app
        if not limiter.enabled:
            return await call_next(request)

        handler = _find_route_handler(_flatten_routes(app), request.scope)
        if _should_exempt(limiter, handler):
            return await call_next(request)

        error_response, should_inject_headers = sync_check_limits(limiter, request, handler, app)
        if error_response is not None:
            return error_response

        response = await call_next(request)
        if should_inject_headers:
            response = limiter._inject_headers(response, request.state.view_rate_limit)
        return response
