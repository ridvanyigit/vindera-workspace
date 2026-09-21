"""Request rate limiting (slowapi).

`limiter` carries the default budget for every route. Expensive endpoints
tighten it with `@limiter.limit("...")`; those handlers must accept a
`request: Request` argument, as slowapi requires.

A decorated limit runs inside the handler, i.e. after authentication. To keep a
flood of bad tokens from reaching Supabase on those routes, `APPLICATION_LIMIT`
is a shared per-IP budget that the middleware enforces before anything else.

Counters are per client IP and per worker process. Behind a reverse proxy,
start uvicorn with `--proxy-headers` so the real client IP is used.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

DEFAULT_LIMIT = "120/minute"
CHAT_LIMIT = "20/minute"
SCAN_LIMIT = "30/minute"
APPLICATION_LIMIT = "300/minute"

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[DEFAULT_LIMIT],
    application_limits=[APPLICATION_LIMIT],
)
