"""Authentication dependencies for the FastAPI backend.

Three ways in, each used by a different caller:

* `require_admin`               - the logged-in admin (Supabase access token).
* `require_admin_or_automation` - the admin, or n8n with the shared secret.
                                  Used only by the scan / watchlist endpoints.
* `require_metrics_token`       - Prometheus scraping `/metrics`.

The Supabase client imported here is the service-role client. Never call
`sign_in_*` on it: that would replace its service-role credentials with the
user's session token. Only `auth.get_user(token)` (a stateless lookup) is used.
"""

import hashlib
import hmac
import logging
import time
from dataclasses import dataclass
from typing import Literal

from fastapi import Header, HTTPException
from starlette.concurrency import run_in_threadpool
from supabase import AuthError, AuthRetryableError

from src.core.config import settings
from src.core.database import supabase

logger = logging.getLogger("vindera.auth")

# A verified admin token is trusted for this long before Supabase is asked again,
# so a page that fires several requests does not cost several auth round trips.
# The trade-off: a removed admin keeps access for at most this many seconds.
ADMIN_CACHE_TTL_SECONDS = 60
_ADMIN_CACHE_MAX_ENTRIES = 256


@dataclass(frozen=True)
class AuthPrincipal:
    """Who is calling. `user_id` is set for admins, None for the automation key."""

    method: Literal["admin", "automation"]
    user_id: str | None = None
    email: str | None = None


# sha256(token) -> (expires_at [monotonic], principal). Only successful admin
# lookups are cached, and the raw token is never stored.
_admin_cache: dict[str, tuple[float, AuthPrincipal]] = {}


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


# A Supabase access token is a three-part JWT well under this size.
_MAX_TOKEN_LENGTH = 4096


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def _looks_like_jwt(token: str) -> bool:
    """Cheap shape check so obvious garbage never costs a Supabase round trip."""
    return len(token) <= _MAX_TOKEN_LENGTH and token.count(".") == 2


def _token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _cache_get(fingerprint: str) -> AuthPrincipal | None:
    entry = _admin_cache.get(fingerprint)
    if entry is None:
        return None
    expires_at, principal = entry
    if expires_at <= time.monotonic():
        _admin_cache.pop(fingerprint, None)
        return None
    return principal


def _cache_put(fingerprint: str, principal: AuthPrincipal) -> None:
    if len(_admin_cache) >= _ADMIN_CACHE_MAX_ENTRIES:
        now = time.monotonic()
        for key in [k for k, (expires_at, _) in _admin_cache.items() if expires_at <= now]:
            _admin_cache.pop(key, None)
        if len(_admin_cache) >= _ADMIN_CACHE_MAX_ENTRIES:
            _admin_cache.clear()
    _admin_cache[fingerprint] = (time.monotonic() + ADMIN_CACHE_TTL_SECONDS, principal)


def clear_admin_cache() -> None:
    """Drop every cached admin lookup (used by tests)."""
    _admin_cache.clear()


def _lookup_admin(token: str) -> AuthPrincipal:
    """Blocking Supabase lookup: validate the token, then check `admin_users`.

    Raises HTTPException 401 (bad token), 403 (valid user, not an admin) or
    503 (Supabase unreachable). Runs in a worker thread.
    """
    try:
        user_response = supabase.auth.get_user(token)
    except AuthRetryableError:
        logger.error("Supabase auth service unreachable while validating a token")
        raise HTTPException(status_code=503, detail="Authentication service unavailable.")
    except AuthError:
        raise _unauthorized("Invalid or expired token.")
    except Exception:
        logger.exception("Unexpected error while validating a token")
        raise HTTPException(status_code=503, detail="Authentication service unavailable.")

    user = getattr(user_response, "user", None)
    if user is None:
        raise _unauthorized("Invalid or expired token.")

    try:
        membership = (
            supabase.table("admin_users").select("user_id").eq("user_id", user.id).limit(1).execute()
        )
    except Exception:
        logger.exception("Could not read admin_users while authorizing a request")
        raise HTTPException(status_code=503, detail="Authentication service unavailable.")

    if not membership.data:
        logger.warning("Authenticated non-admin user %s was denied", user.id)
        raise HTTPException(status_code=403, detail="Admin access required.")

    return AuthPrincipal(method="admin", user_id=str(user.id), email=user.email)


async def _authenticate_admin(token: str) -> AuthPrincipal:
    if not _looks_like_jwt(token):
        raise _unauthorized("Invalid or expired token.")

    fingerprint = _token_fingerprint(token)
    cached = _cache_get(fingerprint)
    if cached is not None:
        return cached

    principal = await run_in_threadpool(_lookup_admin, token)
    _cache_put(fingerprint, principal)
    return principal


def _matches_secret(provided: str, secret_value: str | None) -> bool:
    """Constant-time comparison; an unset or empty secret never matches."""
    if not secret_value:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), secret_value.encode("utf-8"))


async def require_admin(authorization: str | None = Header(default=None)) -> AuthPrincipal:
    """Allow only a logged-in Vindera admin (Bearer Supabase access token)."""
    token = _extract_bearer(authorization)
    if token is None:
        raise _unauthorized("Missing bearer token.")
    return await _authenticate_admin(token)


async def require_admin_or_automation(
    authorization: str | None = Header(default=None),
    x_vindera_key: str | None = Header(default=None),
) -> AuthPrincipal:
    """Allow a logged-in admin, or the automation caller (n8n) with `X-Vindera-Key`."""
    if x_vindera_key is not None:
        secret = settings.AUTOMATION_SHARED_SECRET
        if _matches_secret(x_vindera_key, secret.get_secret_value() if secret else None):
            return AuthPrincipal(method="automation")
        raise _unauthorized("Invalid automation key.")

    token = _extract_bearer(authorization)
    if token is None:
        raise _unauthorized("Missing bearer token or automation key.")
    return await _authenticate_admin(token)


async def require_metrics_token(authorization: str | None = Header(default=None)) -> None:
    """Guard `/metrics` with `Authorization: Bearer <METRICS_TOKEN>`.

    In development with no token configured the endpoint stays open so the
    local Prometheus works out of the box. Production refuses to start without
    a token (see `Settings`), so it is never open there.
    """
    secret = settings.METRICS_TOKEN
    if secret is None:
        return

    token = _extract_bearer(authorization)
    if token is None or not _matches_secret(token, secret.get_secret_value()):
        raise _unauthorized("Invalid metrics token.")


# --- Startup guard ----------------------------------------------------------

def _has_auth_dependency(dependant) -> bool:
    for sub in dependant.dependencies:
        if sub.call in (require_admin, require_admin_or_automation) or _has_auth_dependency(sub):
            return True
    return False


def _iter_api_routes(routes, prefix: str = ""):
    """Yield (full_path, APIRoute) for every route, following included routers.

    FastAPI mounts `include_router` lazily: `app.routes` holds wrapper objects
    that expose the included router as `original_router`, so the wrappers have
    to be unwrapped to see the real routes.
    """
    from fastapi.routing import APIRoute

    for route in routes:
        original = getattr(route, "original_router", None)
        if original is not None:
            context = getattr(route, "include_context", None)
            yield from _iter_api_routes(original.routes, prefix + (getattr(context, "prefix", "") or ""))
        elif isinstance(route, APIRoute):
            yield prefix + route.path, route


def list_unprotected_routes(app, prefix: str) -> list[str]:
    """Routes under `prefix` that carry no admin/automation auth dependency."""
    return [
        f"{','.join(sorted(route.methods))} {path}"
        for path, route in _iter_api_routes(app.routes)
        if path.startswith(prefix) and not _has_auth_dependency(route.dependant)
    ]


def assert_routes_protected(app, prefix: str) -> None:
    """Raise if any route under `prefix` lacks an admin/automation auth dependency.

    Called from main.py at import time, so a new router that forgets its
    dependency makes the app refuse to start instead of silently going public.
    """
    if not any(path.startswith(prefix) for path, _ in _iter_api_routes(app.routes)):
        # Guards against a FastAPI upgrade changing how routes are stored and
        # this check quietly passing on an empty list.
        raise RuntimeError(f"Route guard found no routes under {prefix}; check FastAPI internals.")

    unprotected = list_unprotected_routes(app, prefix)
    if unprotected:
        raise RuntimeError("Unauthenticated API routes: " + "; ".join(unprotected))
