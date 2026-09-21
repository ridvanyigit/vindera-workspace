"""The scan pipeline end to end, with Keepa, OpenAI, Pushover and the database replaced by stand-ins."""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from src.agents.listing_generator_agent import GeneratedListing
from src.core.config import settings
from src.core.metrics import SCAN_JOBS
from src.services import scan_pipeline
from src.services.keepa_service import KeepaTokensExhausted, KeepaUnavailable, keepa_service
from src.services.notification_service import notification_service
from src.agents.deal_analyzer_agent import deal_analyzer
from src.agents.listing_generator_agent import listing_generator

from tests.helpers import analysis_for, facts

ASIN = "B0TEST0001"


class Stubs:
    """Handles on everything the pipeline talks to."""

    def __init__(self, db, monkeypatch):
        self.db = db
        self.persist_calls = db.rpc_named("persist_scan_result")
        db.seed("business_settings", {"id": 1})  # every value falls back to the built-in defaults
        db.seed("opportunities", {"id": "opp-1", "last_alerted_at": None})
        db.rpc_handlers["persist_scan_result"] = lambda params: {"opportunity_id": "opp-1"}

        self.fetch = AsyncMock(return_value=facts())
        self.analyze = AsyncMock(side_effect=lambda kf, events: analysis_for(kf, 10))
        self.listing = AsyncMock(return_value=GeneratedListing(generated_title="Titel", generated_description="Beschreibung"))
        self.alert = AsyncMock(return_value=True)
        self.tokens_alert = AsyncMock(return_value=True)
        monkeypatch.setattr(keepa_service, "fetch_facts", self.fetch)
        monkeypatch.setattr(deal_analyzer, "analyze_deal", self.analyze)
        monkeypatch.setattr(listing_generator, "generate_willhaben_listing", self.listing)
        monkeypatch.setattr(notification_service, "send_deal_alert", self.alert)
        monkeypatch.setattr(notification_service, "send_keepa_tokens_exhausted", self.tokens_alert)

    async def scan(self, asin=ASIN) -> dict:
        job_id = await scan_pipeline.create_scan_job(asin)
        await scan_pipeline.run_deal_scan_pipeline(asin, job_id)
        return next(job for job in self.db.tables["scan_jobs"] if job["id"] == job_id)

    @property
    def persisted(self) -> list[dict]:
        return [params["payload"] for params in self.db.rpc_named("persist_scan_result")]

    def nothing_was_saved_or_sent(self):
        assert self.db.rpc_named("persist_scan_result") == []
        assert self.db.tables.get("opportunities") == [{"id": "opp-1", "last_alerted_at": None}]
        self.alert.assert_not_awaited()
        self.analyze.assert_not_awaited()
        self.listing.assert_not_awaited()


@pytest.fixture
def stubs(db, monkeypatch):
    return Stubs(db, monkeypatch)


def failed_count() -> float:
    return SCAN_JOBS.labels("failed")._value.get()


# --- Keepa failure: a visible failed job, never a fake deal ------------------------

async def test_keepa_failure_without_mock_data_fails_the_job_and_writes_nothing(stubs):
    stubs.fetch.side_effect = KeepaUnavailable("network error (ConnectError)")
    before = failed_count()

    job = await stubs.scan()

    assert job["status"] == "failed"
    assert job["error"] == "Keepa: network error (ConnectError)"
    assert job["finished_at"]
    assert failed_count() == before + 1
    stubs.nothing_was_saved_or_sent()


async def test_token_exhaustion_fails_the_job_with_a_retry_time_and_pushes_once(stubs):
    stubs.fetch.side_effect = KeepaTokensExhausted(90)

    job = await stubs.scan()

    assert job["status"] == "failed" and "tokens exhausted" in job["error"]
    assert datetime.fromisoformat(job["retry_after"]) > datetime.now(timezone.utc)
    stubs.tokens_alert.assert_awaited_once_with(90)
    stubs.nothing_was_saved_or_sent()


async def test_token_exhaustion_never_falls_back_to_mock_data(stubs, monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_MOCK_DATA", True)
    stubs.fetch.side_effect = KeepaTokensExhausted(60)

    job = await stubs.scan()

    assert job["status"] == "failed"
    stubs.nothing_was_saved_or_sent()


@pytest.mark.parametrize("bad", [dict(current=0.0), dict(reference=0.0)])
async def test_a_zero_price_is_not_a_deal(stubs, bad):
    stubs.fetch.return_value = facts(**bad)

    job = await stubs.scan()

    assert job["status"] == "failed" and job["error"] == "Keepa returned no usable price"
    stubs.nothing_was_saved_or_sent()


async def test_an_ai_failure_fails_the_job_and_writes_nothing(stubs):
    stubs.analyze.side_effect = RuntimeError("OpenAI API key is not configured.")

    job = await stubs.scan()

    assert job["status"] == "failed" and "OpenAI API key is not configured" in job["error"]
    assert stubs.db.rpc_named("persist_scan_result") == []
    stubs.alert.assert_not_awaited()


async def test_dev_mock_data_is_marked_and_only_used_when_allowed(stubs, monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_MOCK_DATA", True)
    stubs.fetch.side_effect = KeepaUnavailable("Keepa API key is not configured")

    await stubs.scan()

    payload = stubs.persisted[0]
    assert payload["title"].startswith("[MOCK]")
    assert payload["buybox_seller"] == "MOCK"
    assert payload["price_history"] == []


# --- the numbers come from code ------------------------------------------------------

async def test_a_good_deal_is_saved_with_computed_figures(stubs):
    job = await stubs.scan()

    payload = stubs.persisted[0]
    assert payload["status"] == "pending"
    assert payload["buy_price"] == 30.0
    assert payload["target_sell_price"] == 65.0            # midpoint of 30 and 100
    assert payload["net_profit_estimate"] == 24.65         # 65 - 31.50 - 6.90 - 1.95
    assert payload["net_margin_estimate"] == payload["profit_margin"] == 78.25
    assert payload["emergency_sell_price"] == 55.25        # 85%, above break-even
    assert payload["job_id"] == job["id"]
    assert payload["buybox_seller"] == "Amazon"
    assert payload["deal_score"] == 100
    assert payload["listing"]["generated_title"] == "Titel"
    assert payload["price_history"] == facts().price_history
    for key in ("is_profitable", "estimated_profit_margin", "suggested_price"):
        assert key not in payload


async def test_a_deal_below_the_no_buy_minimums_is_rejected_without_listing_or_push(stubs):
    stubs.fetch.return_value = facts(current=30.0, reference=44.0)   # sells at 37: net profit far below EUR 15

    await stubs.scan()

    payload = stubs.persisted[0]
    assert payload["status"] == "rejected"
    assert payload["listing"] is None
    assert "REJECTED by the No-Buy rule" in payload["ai_decision"]
    stubs.listing.assert_not_awaited()
    stubs.alert.assert_not_awaited()


async def test_the_no_buy_minimums_come_from_business_settings(stubs):
    stubs.db.tables["business_settings"][0].update(min_net_profit_eur=30)

    await stubs.scan()

    assert stubs.persisted[0]["status"] == "rejected"   # 24.65 is now below the owner's EUR 30


# --- hot deal push ---------------------------------------------------------------------

async def test_a_hot_deal_pushes_once_and_is_not_repeated_within_a_week(stubs):
    await stubs.scan()
    stubs.alert.assert_awaited_once()
    assert stubs.db.tables["opportunities"][0]["last_alerted_at"]

    await stubs.scan()
    assert stubs.alert.await_count == 1
    assert len(stubs.persisted) == 2


async def test_the_push_returns_after_the_cooldown(stubs):
    old = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
    stubs.db.tables["opportunities"][0]["last_alerted_at"] = old

    await stubs.scan()

    stubs.alert.assert_awaited_once()


async def test_a_lukewarm_deal_does_not_push(stubs):
    stubs.analyze.side_effect = lambda kf, events: analysis_for(kf, 5)

    await stubs.scan()

    assert stubs.persisted[0]["status"] == "pending"
    stubs.alert.assert_not_awaited()


async def test_a_failed_push_does_not_fail_the_job(stubs):
    stubs.alert.side_effect = RuntimeError("pushover down")
    before = failed_count()

    job = await stubs.scan()

    assert job["status"] != "failed"
    assert failed_count() == before
    assert len(stubs.persisted) == 1


# --- concurrency ---------------------------------------------------------------------------

async def test_at_most_two_scans_run_at_once(stubs):
    running = peak = 0

    async def slow_fetch(_asin):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.02)
        running -= 1
        return facts()

    stubs.fetch.side_effect = slow_fetch
    await asyncio.gather(*(stubs.scan(f"B0TEST000{i}") for i in range(6)))

    assert scan_pipeline.SCAN_CONCURRENCY == 2
    assert peak == 2
    assert len(stubs.persisted) == 6


# --- startup clean-up -----------------------------------------------------------------------

async def test_jobs_left_over_from_a_restart_are_closed_and_fresh_ones_are_kept(db):
    def ago(minutes):
        return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()

    db.seed(
        "scan_jobs",
        {"id": "old-running", "status": "running", "started_at": ago(20), "created_at": ago(21)},
        {"id": "old-queued", "status": "queued", "started_at": None, "created_at": ago(30)},
        {"id": "fresh-running", "status": "running", "started_at": ago(2), "created_at": ago(3)},
        {"id": "done", "status": "succeeded", "started_at": ago(60), "created_at": ago(61)},
    )

    closed = await scan_pipeline.fail_interrupted_scan_jobs()

    status = {job["id"]: job["status"] for job in db.tables["scan_jobs"]}
    assert closed == 2
    assert status == {"old-running": "failed", "old-queued": "failed", "fresh-running": "running", "done": "succeeded"}
    assert db.tables["scan_jobs"][0]["error"] == "interrupted by restart"
