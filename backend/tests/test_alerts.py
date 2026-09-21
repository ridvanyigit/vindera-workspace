"""Daily inventory alerts: dead stock and Amazon return deadlines are each announced once."""

from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from src.services import inventory_alerts
from src.services.notification_service import notification_service

NOW = datetime.now(timezone.utc)


def days_ago(days):
    return (NOW - timedelta(days=days, minutes=1)).isoformat()


def unit(unit_id, status="listed", **fields):
    return {
        "id": unit_id, "status": status, "buy_price": 20.0, "purchase_price_actual": None, "received_at": None,
        "purchased_at": None, "created_at": days_ago(1), "return_by": None, "deleted_at": None,
        "dead_stock_notified_at": None, "return_alert_notified_at": None, "products": {"title": f"Item {unit_id}"}, **fields,
    }


@pytest.fixture
def push(monkeypatch):
    dead = AsyncMock(return_value=True)
    returns = AsyncMock(return_value=True)
    monkeypatch.setattr(notification_service, "send_dead_stock_alert", dead)
    monkeypatch.setattr(notification_service, "send_return_deadline_alert", returns)
    return dead, returns


def test_holding_age_counts_from_receipt_then_purchase_then_scan():
    assert inventory_alerts.holding_days({"received_at": days_ago(70), "purchased_at": days_ago(90), "created_at": days_ago(99)}, NOW) == 70
    assert inventory_alerts.holding_days({"purchased_at": days_ago(90), "created_at": days_ago(99)}, NOW) == 90
    assert inventory_alerts.holding_days({"created_at": days_ago(99)}, NOW) == 99
    assert inventory_alerts.holding_days({}, NOW) is None


async def test_dead_stock_needs_more_than_sixty_full_days_and_is_announced_once(db, push):
    dead, _ = push
    db.seed(
        "opportunities",
        unit("old", received_at=days_ago(75)),
        unit("edge", received_at=days_ago(60)),                       # exactly 60 full days: not yet
        unit("young", received_at=days_ago(10)),
        unit("bought-long-ago", status="bought", received_at=None, purchased_at=days_ago(80)),
        unit("sold", status="sold", received_at=days_ago(200)),
        unit("deleted", received_at=days_ago(200), deleted_at=days_ago(1)),
        unit("already", received_at=days_ago(200), dead_stock_notified_at=days_ago(3)),
    )

    await inventory_alerts.run_dead_stock_scan()

    (items, threshold), _kwargs = dead.await_args
    assert sorted(item["id"] for item in items) == ["bought-long-ago", "old"]
    assert threshold == 60
    stamped = {row["id"] for row in db.tables["opportunities"] if row["dead_stock_notified_at"]}
    assert stamped == {"old", "bought-long-ago", "already"}

    await inventory_alerts.run_dead_stock_scan()
    assert dead.await_count == 1                                       # nothing new the second time


async def test_a_failed_push_leaves_the_units_for_the_next_run(db, push):
    dead, _ = push
    dead.return_value = False
    db.seed("opportunities", unit("old", received_at=days_ago(75)))

    await inventory_alerts.run_dead_stock_scan()

    assert db.tables["opportunities"][0]["dead_stock_notified_at"] is None


async def test_return_deadline_window_is_today_through_five_days(db, push):
    _, returns = push
    today = date.today()
    db.seed(
        "opportunities",
        unit("today", return_by=today.isoformat()),
        unit("in-3", return_by=(today + timedelta(days=3)).isoformat()),
        unit("in-5", return_by=(today + timedelta(days=5)).isoformat()),
        unit("in-6", return_by=(today + timedelta(days=6)).isoformat()),
        unit("overdue", return_by=(today - timedelta(days=1)).isoformat()),
        unit("no-date"),
        unit("sold", status="sold", return_by=today.isoformat()),
        unit("deleted", return_by=today.isoformat(), deleted_at=days_ago(1)),
    )

    await inventory_alerts.run_return_window_scan()

    (items,), _kwargs = returns.await_args
    assert [item["id"] for item in items] == ["today", "in-3", "in-5"]
    assert [item["days_left"] for item in items] == [0, 3, 5]

    await inventory_alerts.run_return_window_scan()
    assert returns.await_count == 1


async def test_one_failing_check_does_not_stop_the_other(db, push, monkeypatch):
    _, returns = push
    monkeypatch.setattr(inventory_alerts, "run_dead_stock_scan", AsyncMock(side_effect=RuntimeError("boom")))
    db.seed("opportunities", unit("soon", return_by=date.today().isoformat()))

    await inventory_alerts.run_inventory_alerts()

    returns.assert_awaited_once()
