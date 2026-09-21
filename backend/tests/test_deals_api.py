"""Deal endpoints through the real app and the real auth dependency; only the database is fake."""

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from src.api.endpoints import deals
from src.core.config import settings
from src.main import app

TOKEN = "aaaa.bbbb.cccc"
API = "/api/v1/deals"


@pytest.fixture
def client(db):
    db.add_admin(TOKEN)
    db.seed("business_settings", {"id": 1})     # every figure falls back to the placeholder defaults
    return TestClient(app, headers={"Authorization": f"Bearer {TOKEN}"})


def deal(db, status="pending", **fields) -> str:
    opportunity_id = str(uuid.uuid4())
    db.seed("opportunities", {
        "id": opportunity_id, "status": status, "buy_price": 20.0, "target_sell_price": 60.0,
        "deleted_at": None, "purchase_price_actual": None, "inbound_shipping_cost": None,
        "packaging_cost": None, "emergency_sell_price": None, "received_at": None, **fields,
    })
    return opportunity_id


def stored(db, opportunity_id) -> dict:
    return next(row for row in db.tables["opportunities"] if row["id"] == opportunity_id)


def rpc_error(code, message="db says no"):
    return APIError({"message": message, "code": code, "details": None, "hint": None})


# --- status endpoint --------------------------------------------------------------------

def test_an_illegal_status_change_is_409_and_changes_nothing(client, db):
    opportunity_id = deal(db, "pending")
    response = client.patch(f"{API}/{opportunity_id}/status", json={"status": "listed"})
    assert response.status_code == 409
    assert "cannot become" in response.json()["detail"]
    assert stored(db, opportunity_id)["status"] == "pending"


def test_sold_cannot_be_set_through_the_status_endpoint(client, db):
    opportunity_id = deal(db, "listed")
    response = client.patch(f"{API}/{opportunity_id}/status", json={"status": "sold"})
    assert response.status_code == 409 and "sale endpoint" in response.json()["detail"]


def test_an_unknown_status_is_422(client, db):
    assert client.patch(f"{API}/{deal(db)}/status", json={"status": "shipped"}).status_code == 422


def test_bought_requires_the_price_actually_paid(client, db):
    response = client.patch(f"{API}/{deal(db)}/status", json={"status": "bought"})
    assert response.status_code == 422 and "purchase_price_actual" in response.json()["detail"]


def test_marking_bought_records_the_purchase_return_by_date_and_recomputed_estimate(client, db):
    opportunity_id = deal(db)
    response = client.patch(f"{API}/{opportunity_id}/status", json={
        "status": "bought", "purchase_price_actual": 20, "order_ref": "TEST-1",
        "inbound_shipping_cost": 2, "packaging_cost": 1,
    })
    assert response.status_code == 200

    row = stored(db, opportunity_id)
    assert row["status"] == "bought" and row["order_ref"] == "TEST-1"
    assert date.fromisoformat(row["return_by"]) == (datetime.now(timezone.utc) + timedelta(days=30)).date()
    assert datetime.fromisoformat(row["purchased_at"]).tzinfo is not None
    # docs/MANUAL-TEST-SCRIPT.md 2.1: cost 23.00, net profit 28.30, margin 123.04 % on cost
    assert row["net_profit_estimate"] == 28.30
    assert row["net_margin_estimate"] == row["profit_margin"] == 123.04


def test_the_return_window_comes_from_business_settings(client, db):
    db.tables["business_settings"][0]["return_window_days"] = 14
    opportunity_id = deal(db)
    client.patch(f"{API}/{opportunity_id}/status", json={"status": "bought", "purchase_price_actual": 20})
    assert date.fromisoformat(stored(db, opportunity_id)["return_by"]) == (datetime.now(timezone.utc) + timedelta(days=14)).date()


def test_receiving_and_listing_stamp_their_dates(client, db):
    opportunity_id = deal(db, "bought")
    client.patch(f"{API}/{opportunity_id}/status", json={"status": "in_inventory"})
    assert stored(db, opportunity_id)["received_at"]
    client.patch(f"{API}/{opportunity_id}/status", json={"status": "listed"})
    assert stored(db, opportunity_id)["listed_at"]


def test_the_emergency_price_never_drops_below_break_even_after_a_cost_change(client, db):
    opportunity_id = deal(db, "bought", emergency_sell_price=20.0, purchase_price_actual=20.0)
    client.patch(f"{API}/{opportunity_id}/status", json={"inbound_shipping_cost": 3})
    assert stored(db, opportunity_id)["emergency_sell_price"] >= 34.0


def test_a_field_can_be_cleared_and_an_invalid_link_is_refused(client, db):
    opportunity_id = deal(db, "listed", willhaben_url="https://www.willhaben.at/iad/x/1")
    assert client.patch(f"{API}/{opportunity_id}/status", json={"target_sell_price": 70}).status_code == 200
    assert stored(db, opportunity_id)["willhaben_url"] == "https://www.willhaben.at/iad/x/1"   # not sent: untouched

    assert client.patch(f"{API}/{opportunity_id}/status", json={"willhaben_url": "https://example.com"}).status_code == 422
    assert client.patch(f"{API}/{opportunity_id}/status", json={"willhaben_url": ""}).status_code == 200
    assert stored(db, opportunity_id)["willhaben_url"] is None


def test_two_requests_racing_cannot_both_apply(client, db, monkeypatch):
    opportunity_id = deal(db, "listed")     # the database already moved on ...
    monkeypatch.setattr(deals, "_get_open_row", lambda _id: {**stored(db, opportunity_id), "status": "in_inventory"})
    response = client.patch(f"{API}/{opportunity_id}/status", json={"status": "listed"})   # ... this request still saw in_inventory
    assert response.status_code == 409 and "changed in the meantime" in response.json()["detail"]


def test_unknown_and_soft_deleted_deals_are_404(client, db):
    assert client.patch(f"{API}/{uuid.uuid4()}/status", json={"status": "bought", "purchase_price_actual": 5}).status_code == 404
    gone = deal(db, deleted_at="2026-01-01T00:00:00+00:00")
    assert client.patch(f"{API}/{gone}/status", json={"target_sell_price": 5}).status_code == 404
    assert client.delete(f"{API}/{gone}").status_code == 404


# --- sale and return ----------------------------------------------------------------------

def test_a_sale_is_refused_unless_the_unit_is_in_stock_or_listed(client, db):
    for status in ("pending", "bought", "sold", "cancelled"):
        response = client.post(f"{API}/{deal(db, status)}/sale", json={"amount": 60})
        assert response.status_code == 409, status
    assert db.rpc_named("record_sale") == []


def test_the_profit_of_a_sale_is_computed_by_the_backend_and_the_clients_value_is_ignored(client, db):
    db.rpc_handlers["record_sale"] = lambda params: {"opportunity_id": params["p_id"], "sold_at": "2026-09-21T10:00:00+00:00"}
    opportunity_id = deal(db, "listed", purchase_price_actual=20.0, inbound_shipping_cost=2.0, packaging_cost=1.0)

    response = client.post(f"{API}/{opportunity_id}/sale", json={"amount": 60, "shipping_cost": 6.9, "actual_profit": 9999})

    assert response.status_code == 200
    body = response.json()
    assert (body["actual_profit"], body["net_margin_pct"], body["total_cost"]) == (30.10, 130.87, 23.0)   # MANUAL-TEST-SCRIPT 3.2
    (call,) = db.rpc_named("record_sale")
    assert call["p_id"] == opportunity_id
    assert call["payload"]["actual_profit"] == 30.10 and call["payload"]["actor"] == "admin-1"


@pytest.mark.parametrize("body", [{"amount": 0}, {"amount": -5}, {"amount": 60, "shipping_cost": -1}, {"amount": 1e9}, {}])
def test_bad_sale_amounts_are_422(client, db, body):
    assert client.post(f"{API}/{deal(db, 'listed')}/sale", json=body).status_code == 422


def test_a_return_goes_through_the_atomic_function_with_the_actor(client, db):
    db.rpc_handlers["record_return"] = lambda params: {"opportunity_id": params["p_id"]}
    opportunity_id = deal(db, "sold")

    response = client.post(f"{API}/{opportunity_id}/return", json={"return_shipping_cost": 4.5})

    assert response.status_code == 200
    (call,) = db.rpc_named("record_return")
    assert call["payload"] == {"return_shipping_cost": 4.5, "actor": "admin-1"}


@pytest.mark.parametrize(
    ("code", "status"),
    [("22023", 422), ("P0002", 404), ("55000", 409), ("23505", 409), ("XX000", 500)],
)
def test_database_error_codes_become_http_errors(client, db, code, status):
    def fail(_params):
        raise rpc_error(code, "internal detail: relation opportunities")

    db.rpc_handlers["record_return"] = fail
    response = client.post(f"{API}/{deal(db, 'sold')}/return", json={})
    assert response.status_code == status
    if status == 500:
        assert "relation" not in response.text        # unexpected database errors are not echoed


def test_a_duplicate_open_deal_gets_a_readable_message(client, db):
    def duplicate(_params):
        raise rpc_error("23505", 'duplicate key value violates unique constraint "uq_opportunities_open_scan_per_product"')

    db.rpc_handlers["create_manual_deal"] = duplicate
    response = client.post(f"{API}/manual", json={
        "asin": "B0TEST0001", "title": "Kopfhörer", "category": "Other", "buy_price": 20, "target_sell_price": 60,
        "status": "pending", "listing_title": "T", "listing_description": "D",
    })
    assert response.status_code == 409 and "already has an open scan" in response.json()["detail"]


# --- delete ---------------------------------------------------------------------------------

def test_a_pending_deal_is_soft_deleted_never_removed(client, db):
    opportunity_id = deal(db, "pending")
    response = client.delete(f"{API}/{opportunity_id}")
    assert response.status_code == 200
    assert stored(db, opportunity_id)["deleted_at"]            # the row is still there
    assert client.delete(f"{API}/{opportunity_id}").status_code == 404


def test_a_sold_deal_or_one_with_sale_history_cannot_be_deleted(client, db):
    sold = deal(db, "sold")
    returned = deal(db, "in_inventory")
    db.seed("sale_events", {"id": "e1", "opportunity_id": returned, "event_type": "sale"})

    for opportunity_id in (sold, returned):
        response = client.delete(f"{API}/{opportunity_id}")
        assert response.status_code == 409 and "written off" in response.json()["detail"]
        assert stored(db, opportunity_id)["deleted_at"] is None


def test_no_route_can_delete_a_product_or_hard_delete_a_deal():
    from src.core.auth import _iter_api_routes

    deletes = [path for path, route in _iter_api_routes(app.routes) if "DELETE" in (route.methods or set())]
    assert deletes == ["/api/v1/deals/{opportunity_id}", "/api/v1/expenses/{expense_id}"]


def test_the_delete_handler_only_ever_updates_deleted_at():
    import inspect

    source = inspect.getsource(deals.delete_opportunity)
    assert ".delete()" not in source


# --- scan endpoint ----------------------------------------------------------------------------

def test_scan_accepts_the_automation_key_and_normalizes_the_asin(client, db):
    response = TestClient(app).post(
        f"{API}/scan", json={"asin": " b0test0001 "}, headers={"X-Vindera-Key": settings.AUTOMATION_SHARED_SECRET.get_secret_value()}
    )
    assert response.status_code == 202
    (job,) = db.tables["scan_jobs"]
    assert job["asin"] == "B0TEST0001"
    # No Keepa key in the tests: the job ends as failed, and nothing was saved as a deal.
    assert job["status"] == "failed" and job["error"].startswith("Keepa:")
    assert db.rpc_named("persist_scan_result") == []


@pytest.mark.parametrize("asin", ["short", "B0TEST00012", "B0TEST000!", "", "../../etc/x", "B0TEST0001; drop"])
def test_scan_rejects_a_bad_asin(client, asin):
    assert client.post(f"{API}/scan", json={"asin": asin}).status_code == 422
