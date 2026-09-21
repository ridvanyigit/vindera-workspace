"""The lifecycle state machine: every allowed move, and every move that must be refused."""

from datetime import date, datetime, timezone

import pytest

from src.services.lifecycle import (
    ALLOWED_TRANSITIONS,
    IllegalTransition,
    can_record_sale,
    check_transition,
    return_by_date,
)
from src.core.validation import OpportunityStatus
from typing import get_args

ALL_STATUSES = set(get_args(OpportunityStatus))

ALLOWED = [
    ("pending", "bought"),
    ("pending", "rejected"),
    ("rejected", "pending"),
    ("bought", "in_inventory"),
    ("bought", "cancelled"),
    ("in_inventory", "listed"),
    ("in_inventory", "written_off"),
    ("listed", "in_inventory"),
    ("listed", "written_off"),
]


def test_the_table_covers_exactly_the_database_statuses():
    assert set(ALLOWED_TRANSITIONS) == ALL_STATUSES


@pytest.mark.parametrize(("current", "target"), ALLOWED)
def test_allowed_moves(current, target):
    check_transition(current, target)


@pytest.mark.parametrize(
    ("current", "target"),
    [
        ("pending", "listed"),
        ("pending", "in_inventory"),
        ("pending", "written_off"),
        ("rejected", "bought"),
        ("bought", "listed"),
        ("bought", "pending"),
        ("in_inventory", "bought"),
        ("in_inventory", "pending"),
        ("listed", "bought"),
        ("cancelled", "pending"),
        ("cancelled", "bought"),
        ("written_off", "in_inventory"),
        ("written_off", "listed"),
        ("sold", "listed"),
        ("sold", "in_inventory"),
        ("sold", "pending"),
    ],
)
def test_illegal_moves_are_refused(current, target):
    with pytest.raises(IllegalTransition):
        check_transition(current, target)


@pytest.mark.parametrize("current", sorted(ALL_STATUSES - {"sold"}))
def test_nothing_can_become_sold_through_the_status_endpoint(current):
    with pytest.raises(IllegalTransition, match="sale endpoint"):
        check_transition(current, "sold")


@pytest.mark.parametrize("status", ["sold", "cancelled", "written_off"])
def test_final_statuses_have_no_exit(status):
    assert ALLOWED_TRANSITIONS[status] == frozenset()


@pytest.mark.parametrize("status", sorted(ALL_STATUSES))
def test_staying_put_is_always_fine(status):
    check_transition(status, status)


def test_the_error_names_the_options():
    with pytest.raises(IllegalTransition, match="Allowed: bought, rejected"):
        check_transition("pending", "listed")
    with pytest.raises(IllegalTransition, match="final status"):
        check_transition("cancelled", "pending")


def test_a_sale_is_accepted_from_stock_or_listing_only():
    assert {status for status in ALL_STATUSES if can_record_sale(status)} == {"in_inventory", "listed"}


def test_return_by_counts_from_the_purchase_day():
    purchased = datetime(2026, 9, 21, 15, 30, tzinfo=timezone.utc)
    assert return_by_date(purchased, 30) == date(2026, 10, 21)
    assert return_by_date(purchased, 14) == date(2026, 10, 5)
