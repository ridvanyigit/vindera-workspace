"""Reusable request-validation types shared by every endpoint.

Anything an API caller can send that ends up in the database, in a URL the
storefront links to, or in a paid third-party call (Keepa, OpenAI) is
validated here or in the endpoint's own Pydantic model.
"""

from typing import Annotated, Literal
from urllib.parse import urlparse

from pydantic import AfterValidator, BeforeValidator, Field, StringConstraints

# --- Lifecycle ------------------------------------------------------------

# Keep in sync with the CHECK constraint on `opportunities.status`
# (supabase/migrations) and STATUS_OPTIONS in frontend/src/lib/constants.ts.
OpportunityStatus = Literal[
    "pending",
    "rejected",
    "bought",
    "in_inventory",
    "listed",
    "sold",
    "cancelled",
    "written_off",
]

# Physical condition recorded during the receiving check
# (CONDITION_OPTIONS in frontend/src/lib/constants.ts).
ProductCondition = Literal["NEW", "OPEN BOX", "REVIEW NEEDED"]

# --- ASIN -----------------------------------------------------------------

ASIN_PATTERN = r"^[A-Z0-9]{10}$"


def _normalize_asin(value: object) -> object:
    return value.strip().upper() if isinstance(value, str) else value


# Whitespace is stripped and letters upper-cased before the pattern is checked,
# so " b09y2myl5c " is accepted as B09Y2MYL5C while anything else is a 422.
Asin = Annotated[str, BeforeValidator(_normalize_asin), StringConstraints(pattern=ASIN_PATTERN)]

# --- URLs -----------------------------------------------------------------

MAX_URL_LENGTH = 2048


def _parse_https(value: str) -> tuple[str, str]:
    """Return (stripped url, lower-cased hostname) or raise ValueError."""
    stripped = value.strip()
    parsed = urlparse(stripped)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("URL must start with https://")
    if parsed.username or parsed.password:
        raise ValueError("URL must not contain credentials")
    return stripped, parsed.hostname.lower()


def _https_url(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    return _parse_https(value)[0]


def _willhaben_url(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    stripped, host = _parse_https(value)
    if host != "willhaben.at" and not host.endswith(".willhaben.at"):
        raise ValueError("URL must point to willhaben.at")
    return stripped


# A blank string is treated as "no URL" (None), which is how the UI clears a field.
HttpsUrl = Annotated[str | None, Field(max_length=MAX_URL_LENGTH), AfterValidator(_https_url)]
WillhabenUrl = Annotated[str | None, Field(max_length=MAX_URL_LENGTH), AfterValidator(_willhaben_url)]

# --- Numbers --------------------------------------------------------------

# Upper bounds are deliberately generous for a small resale business; they exist
# to reject typos and abuse (1e12), not to enforce business rules.
MAX_MONEY_EUR = 100_000

PositiveMoney = Annotated[float, Field(gt=0, le=MAX_MONEY_EUR)]
NonNegativeMoney = Annotated[float, Field(ge=0, le=MAX_MONEY_EUR)]
Score0to10 = Annotated[int, Field(ge=0, le=10)]
DealScore = Annotated[int, Field(ge=0, le=100)]
