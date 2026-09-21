"""Opportunity lifecycle: the one place that says which status changes are legal.

    pending      -> bought | rejected
    rejected     -> pending
    bought       -> in_inventory | cancelled
    in_inventory -> listed | written_off
    listed       -> sold | in_inventory | written_off
    sold         -> (nothing; only POST /deals/{id}/return moves a sale back)
    cancelled, written_off are terminal

`sold` is never set through the status endpoint: a sale is a ledger event and
goes through `POST /deals/{id}/sale`. A sale is accepted from `listed` and, for
goods handed over without a Willhaben ad, from `in_inventory`.

Manual entry (PUT /deals/{id}/manual) may set any valid status, because it is
used to back-fill deals that already happened; it does not go through here.
"""

from datetime import date, datetime, timedelta

ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "pending": frozenset({"bought", "rejected"}),
    "rejected": frozenset({"pending"}),
    "bought": frozenset({"in_inventory", "cancelled"}),
    "in_inventory": frozenset({"listed", "written_off"}),
    "listed": frozenset({"sold", "in_inventory", "written_off"}),
    "sold": frozenset(),
    "cancelled": frozenset(),
    "written_off": frozenset(),
}

# A sold status is reached through the sale endpoint, from these statuses only.
SELLABLE_STATUSES = frozenset({"in_inventory", "listed"})

# Units that physically exist (or are on their way) and can still be returned to Amazon.
HELD_STATUSES = ("bought", "in_inventory", "listed")


class IllegalTransition(ValueError):
    """The requested status change is not allowed (maps to HTTP 409)."""


def check_transition(current: str, target: str) -> None:
    """Raise `IllegalTransition` unless `current -> target` is allowed. Staying put is always fine."""
    if current == target:
        return
    if target == "sold":
        raise IllegalTransition("Use the sale endpoint (POST /deals/{id}/sale) to record a sale.")
    allowed = ALLOWED_TRANSITIONS.get(current, frozenset())
    if target not in allowed:
        options = ", ".join(sorted(allowed)) or "none (final status)"
        raise IllegalTransition(f'A deal in status "{current}" cannot become "{target}". Allowed: {options}.')


def can_record_sale(status: str) -> bool:
    return status in SELLABLE_STATUSES


def return_by_date(purchased_at: datetime, window_days: int) -> date:
    """Last day the Amazon return window is open, counted from the purchase date."""
    return (purchased_at + timedelta(days=window_days)).date()
