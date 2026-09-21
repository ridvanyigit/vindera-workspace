"""Report endpoints: the CSV export (the aggregation itself is SQL, see supabase/tests)."""

import pytest
from fastapi.testclient import TestClient

from src.main import app

TOKEN = "aaaa.bbbb.cccc"


@pytest.fixture
def client(db):
    db.add_admin(TOKEN)
    return TestClient(app, headers={"Authorization": f"Bearer {TOKEN}"})


def seed_ledger(db):
    unit = {"sku": "VND-1", "products": {"asin": "B0TEST0001", "title": "Kopfhörer"}}
    db.seed(
        "sale_events",
        {"id": "1", "occurred_at": "2026-03-05T10:00:00+00:00", "event_type": "sale", "amount": 60.0, "shipping_cost": 6.9, "platform_fees": 0, "note": "", "opportunities": unit},
        {"id": "2", "occurred_at": "2026-03-09T10:00:00+00:00", "event_type": "refund", "amount": -60.0, "shipping_cost": 4.5, "platform_fees": 0, "note": "= HYPERLINK(\"http://evil\")", "opportunities": unit},
        {"id": "3", "occurred_at": "2025-12-31T23:30:00+00:00", "event_type": "sale", "amount": 99.0, "shipping_cost": 0, "platform_fees": 0, "note": "", "opportunities": unit},   # 1 Jan 2026 in Vienna
    )
    db.seed(
        "opportunities",
        {"id": "u1", "status": "sold", "deleted_at": None, "sku": "VND-1", "order_ref": "TEST-1", "buy_price": 20.0, "purchase_price_actual": 20.0,
         "inbound_shipping_cost": 2.0, "packaging_cost": 1.0, "purchased_at": "2026-03-01T09:00:00+00:00", "received_at": None,
         "created_at": "2026-02-27T09:00:00+00:00", "products": {"asin": "B0TEST0001", "title": "Kopfhörer"}},
        {"id": "u2", "status": "pending", "deleted_at": None, "sku": "VND-2", "order_ref": None, "buy_price": 5.0, "purchase_price_actual": None,
         "inbound_shipping_cost": None, "packaging_cost": None, "purchased_at": None, "received_at": None, "created_at": "2026-03-02T09:00:00+00:00",
         "products": {"asin": "B0TEST0002", "title": "Not bought"}},
    )
    db.seed("business_expenses", {"id": "x", "incurred_at": "2026-04-01", "description": "Storage", "category": "Other", "amount": 10.0})


def test_csv_has_bom_semicolons_and_the_expected_bookings(client, db):
    seed_ledger(db)
    response = client.get("/api/v1/reports/export.csv?year=2026")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert 'filename="vindera-buchungen-2026.csv"' in response.headers["content-disposition"]
    text = response.content.decode("utf-8")
    assert text.startswith("﻿Datum;Art;")
    lines = text.lstrip("﻿").strip().split("\r\n")[1:]
    kinds = [line.split(";")[1] for line in lines]
    assert sorted(kinds) == sorted([
        "Verkauf", "Rückerstattung", "Versandkosten", "Versandkosten", "Verkauf", "Einkauf", "Ausgabe",
    ])
    purchase = next(line for line in lines if ";Einkauf;" in line).split(";")
    assert purchase[0] == "2026-03-01" and purchase[6] == "23.00" and "TEST-1" in purchase[7]
    assert not any("Not bought" in line for line in lines)                 # a pending scan was never bought


def test_the_new_year_starts_at_vienna_midnight(client, db):
    seed_ledger(db)
    lines = client.get("/api/v1/reports/export.csv?year=2026").text.split("\r\n")
    assert any(line.startswith("2026-01-01;Verkauf;") for line in lines)
    assert not any("2025-12-31" in line for line in lines)


def test_decimal_comma_is_optional(client, db):
    seed_ledger(db)
    assert "6,90" in client.get("/api/v1/reports/export.csv?year=2026&decimal_comma=true").text
    assert "6.90" in client.get("/api/v1/reports/export.csv?year=2026").text


def test_spreadsheet_formulas_in_free_text_are_defused(client, db):
    seed_ledger(db)
    text = client.get("/api/v1/reports/export.csv?year=2026").text
    assert ";\"'= HYPERLINK" in text        # csv quotes the cell because of the inner quotes; the apostrophe comes first
    assert "= HYPERLINK" not in text.replace("'= HYPERLINK", "")


def test_a_previous_year_is_empty_but_valid(client, db):
    seed_ledger(db)
    lines = client.get("/api/v1/reports/export.csv?year=2024").text.strip().split("\r\n")
    assert len(lines) == 1                                                  # header only


@pytest.mark.parametrize("year", ["1999", "2101", "abc"])
def test_year_is_validated(client, year):
    assert client.get(f"/api/v1/reports/export.csv?year={year}").status_code == 422
    assert client.get(f"/api/v1/reports/summary?year={year}").status_code == 422


def test_summary_asks_the_database_for_the_requested_calendar_year(client, db):
    db.rpc_handlers["report_summary"] = lambda params: {"year": params["p_year"]}
    assert client.get("/api/v1/reports/summary?year=2025").json() == {"year": 2025}
    assert db.rpc_named("report_summary") == [{"p_year": 2025}]


def test_every_row_is_read_in_pages_so_the_1000_row_cap_cannot_truncate_a_total(client, db):
    db.seed("business_expenses", *[
        {"id": f"e{i:04d}", "incurred_at": "2026-05-01", "description": f"n{i}", "category": "Other", "amount": 1.0} for i in range(1006)
    ])
    lines = client.get("/api/v1/reports/export.csv?year=2026").text.strip().split("\r\n")
    assert len(lines) == 1 + 1006
