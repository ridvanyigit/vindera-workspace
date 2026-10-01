"""Deal scan pipeline.

    Keepa (real BuyBox / demand / price history) -> AI analysis (qualitative only)
    -> profit calculator (net profit, guardrails) -> listing copy
    -> persist_scan_result RPC (one transaction) -> Pushover for hot deals

Every run is tracked in `scan_jobs` (queued -> running -> succeeded | rejected |
failed), so a failure is visible in the admin dashboard and never becomes a
deal. Nothing fabricated is written unless ALLOW_MOCK_DATA is on (development
only), and then the title starts with "[MOCK]" and the BuyBox seller is "MOCK".

Concurrency: supabase-py is synchronous, so every database call runs through
`asyncio.to_thread` and never blocks the event loop; at most `SCAN_CONCURRENCY`
scans run at once (n8n fires one request per ASIN).
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from src.agents.deal_analyzer_agent import DealAnalysis, build_analysis, deal_analyzer
from src.agents.listing_generator_agent import listing_generator
from src.agents.second_opinion import get_second_opinion
from src.core.config import settings
from src.core.database import supabase
from src.core.injection_guard import looks_like_prompt_injection
from src.core.metrics import PROMPT_INJECTION_BLOCKED, SCAN_JOBS
from src.services.business_settings import load_business_settings
from src.services.keepa_service import (
    KeepaFacts,
    KeepaTokensExhausted,
    KeepaUnavailable,
    keepa_service,
    mock_facts,
)
from src.services.notification_service import notification_service
from src.services.profit_calculator import (
    ProfitResult,
    as_float,
    calculate,
    min_emergency_price,
    passes_guardrails,
    storable_margin,
    suggest_sell_price,
)

logger = logging.getLogger(__name__)

# Push notifications are reserved for exceptional deals, and never repeated for
# the same product within the cooldown.
HOT_DEAL_SCORE_THRESHOLD = 80
ALERT_COOLDOWN_DAYS = 7

EVENT_LOOKAHEAD_DAYS = 90
NO_EVENTS_TEXT = "No major events in the next 90 days."

SCAN_CONCURRENCY = 2
_scan_slots = asyncio.Semaphore(SCAN_CONCURRENCY)

PRICE_SOURCE_LABELS = {
    "buybox": "Amazon BuyBox price",
    "amazon": "Amazon's own price",
    "marketplace_new": "third-party marketplace price (not Amazon, not BuyBox)",
    "buybox_avg90": "90-day BuyBox average",
    "amazon_avg90": "90-day Amazon price average",
    "marketplace_new_avg90": "90-day third-party marketplace average",
}


def _short_error(e: Exception) -> str:
    return f"{type(e).__name__}: {e}"[:500]


# --- scan_jobs --------------------------------------------------------------

async def create_scan_job(asin: str) -> str:
    """Insert a queued job and return its id."""
    res = await asyncio.to_thread(
        lambda: supabase.table("scan_jobs").insert({"asin": asin, "status": "queued"}).execute()
    )
    return res.data[0]["id"]


async def _update_job(job_id: str | None, changes: dict) -> None:
    if not job_id:
        return
    try:
        await asyncio.to_thread(lambda: supabase.table("scan_jobs").update(changes).eq("id", job_id).execute())
    except Exception:
        logger.exception("Could not update scan job %s", job_id)


async def _fail_job(job_id: str | None, error: str, retry_after: datetime | None = None) -> None:
    logger.warning("Scan job %s failed: %s", job_id, error)
    SCAN_JOBS.labels("failed").inc()
    await _update_job(job_id, {
        "status": "failed",
        "error": error[:500],
        "retry_after": retry_after.isoformat() if retry_after else None,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    })


# A job that has not finished this long after it started (or, if it never started,
# after it was queued) belongs to a process that no longer exists.
STALE_JOB_MINUTES = 15


async def fail_interrupted_scan_jobs() -> int:
    """Close jobs left `queued` or `running` by a restart. Returns how many were closed.

    Scans run inside the API process, so a restart drops them without a trace;
    without this the job list would show them as running forever.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=STALE_JOB_MINUTES)).isoformat()
    finished = {
        "status": "failed",
        "error": "interrupted by restart",
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    closed = 0
    for status, column in (("running", "started_at"), ("queued", "created_at")):
        res = await asyncio.to_thread(
            lambda: supabase.table("scan_jobs").update(finished).eq("status", status).lt(column, cutoff).execute()
        )
        closed += len(res.data or [])
    if closed:
        SCAN_JOBS.labels("failed").inc(closed)
        logger.warning("Closed %d scan job(s) interrupted by a restart", closed)
    return closed


# --- helpers ----------------------------------------------------------------

def _fetch_upcoming_events(today) -> str:
    """Next 90 days of calendar events as prompt context. Optional: a failure only loses context."""
    horizon = (today + timedelta(days=EVENT_LOOKAHEAD_DAYS)).isoformat()
    try:
        res = (
            supabase.table("events_calendar")
            .select("event_name, event_date")
            .gte("event_date", today.isoformat())
            .lte("event_date", horizon)
            .execute()
        )
    except Exception as e:
        logger.warning("Could not load events_calendar: %s", _short_error(e))
        return NO_EVENTS_TEXT
    if not res.data:
        return NO_EVENTS_TEXT
    return ", ".join(f"{e['event_name']} on {e['event_date']}" for e in res.data)


def _decision_text(facts: KeepaFacts, analysis: DealAnalysis, result: ProfitResult, passed: bool, min_margin, min_profit) -> str:
    lines = [
        f"Data: buy price EUR {facts.current_price:.2f} = {PRICE_SOURCE_LABELS[facts.price_source]}; "
        f"reference EUR {facts.reference_price:.2f} = {PRICE_SOURCE_LABELS[facts.reference_source]}.",
    ]
    if facts.price_source == "marketplace_new":
        lines.append("WARNING: no BuyBox or Amazon price was available; the price is a third-party marketplace price.")
    lines.append(
        f"Net estimate at the suggested sell price EUR {result.sell_price}: profit EUR {result.net_profit}, "
        f"margin {result.net_margin_pct}% on cost (break-even price: "
        f"{'none' if result.break_even_price is None else 'EUR ' + str(result.break_even_price)})."
    )
    if not passed:
        lines.append(f"REJECTED by the No-Buy rule (needs net margin >= {min_margin}% and net profit >= EUR {min_profit}).")
    return "\n".join(lines) + "\n\n" + analysis.reasoning


async def _alert_if_new(opportunity_id: str, facts: KeepaFacts, result: ProfitResult, asin: str) -> None:
    """Hot-deal push, at most once per product per cooldown (`opportunities.last_alerted_at`)."""
    res = await asyncio.to_thread(
        lambda: supabase.table("opportunities").select("last_alerted_at").eq("id", opportunity_id).execute()
    )
    last = (res.data or [{}])[0].get("last_alerted_at")
    if last:
        last_at = datetime.fromisoformat(last.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) - last_at < timedelta(days=ALERT_COOLDOWN_DAYS):
            logger.info("Hot deal %s not pushed again (alerted %s)", asin, last)
            return

    sent = await notification_service.send_deal_alert(
        product_title=facts.title,
        buy_price=facts.current_price,
        net_profit=float(result.net_profit),
        net_margin_pct=float(result.net_margin_pct),
        amazon_url=f"https://amazon.de/dp/{asin}",
    )
    if sent:
        await asyncio.to_thread(
            lambda: supabase.table("opportunities")
            .update({"last_alerted_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", opportunity_id)
            .execute()
        )


# --- pipeline ---------------------------------------------------------------

async def run_deal_scan_pipeline(asin: str, job_id: str | None = None) -> None:
    """Scan one ASIN. Never raises: every outcome ends up on the scan job."""
    async with _scan_slots:
        await _update_job(job_id, {"status": "running", "started_at": datetime.now(timezone.utc).isoformat()})
        try:
            await _scan(asin, job_id)
        except Exception as e:
            logger.exception("Scan of %s failed", asin)
            await _fail_job(job_id, _short_error(e))


async def run_tracked_scan(asin: str) -> None:
    """Create the scan job, then run the pipeline (for callers that have no job yet, e.g. the chatbot)."""
    await run_deal_scan_pipeline(asin, await create_scan_job(asin))


async def _scan(asin: str, job_id: str | None) -> None:
    now = datetime.now(timezone.utc)

    # 1. Keepa. A depleted token budget always fails the job; other failures fall
    # back to clearly marked mock data only when ALLOW_MOCK_DATA is on.
    try:
        facts = await keepa_service.fetch_facts(asin)
    except KeepaTokensExhausted as e:
        retry_at = now + timedelta(seconds=e.retry_after_seconds)
        await _fail_job(job_id, f"Keepa tokens exhausted; retry after {retry_at:%H:%M} UTC", retry_after=retry_at)
        await notification_service.send_keepa_tokens_exhausted(e.retry_after_seconds)
        return
    except KeepaUnavailable as e:
        if not settings.ALLOW_MOCK_DATA:
            await _fail_job(job_id, f"Keepa: {e}")
            return
        logger.warning("Keepa unavailable for %s (%s); using MOCK data (ALLOW_MOCK_DATA=true)", asin, e)
        facts = mock_facts(asin)

    if facts.current_price <= 0 or facts.reference_price <= 0:
        await _fail_job(job_id, "Keepa returned no usable price")
        return

    # learn/llmops Module 6: input guardrail. Keepa's title/category is external,
    # untrusted text that reaches an agent's prompt below - check it before either
    # agent ever sees it.
    if looks_like_prompt_injection(facts.title) or looks_like_prompt_injection(facts.category):
        PROMPT_INJECTION_BLOCKED.inc()
        await _fail_job(job_id, "Blocked: Keepa title/category looked like a prompt injection attempt")
        return

    # 2. Numbers. The sell price and the verdict come from code, never from the model.
    business = await asyncio.to_thread(load_business_settings)
    profit_settings = business.profit
    sell_price = suggest_sell_price(facts.current_price, facts.reference_price, settings.SELL_PRICE_POSITION)
    result = calculate(sell_price=sell_price, purchase_price=facts.current_price, settings=profit_settings)
    passed = passes_guardrails(result.net_profit, result.net_margin_pct, profit_settings)
    status = "pending" if passed else "rejected"
    emergency = min_emergency_price(result.sell_price, result.break_even_price)

    # 3. AI: qualitative analysis, and listing copy for deals that will be shown.
    events = await asyncio.to_thread(_fetch_upcoming_events, now.date())
    analysis = await deal_analyzer.analyze_deal(facts, events)

    # learn/llmops Module 9: optional, local "second opinion" - logged only, never
    # persisted and never allowed to change the deal above.
    second_opinion = await get_second_opinion(facts, events)
    if second_opinion is not None:
        second_opinion_score = build_analysis(facts, second_opinion).deal_score
        logger.info(
            "Second opinion for %s: deal_score=%d (OpenAI's own score: %d)",
            asin, second_opinion_score, analysis.deal_score,
        )

    listing = None
    if passed:
        generated = await listing_generator.generate_willhaben_listing(
            product_title=facts.title,
            product_category=facts.category,
            payment_text=business.listing_payment_text,
            legal_footer=business.listing_legal_footer,
        )
        listing = {
            "target_platform": "Willhaben",
            "language": "de",
            "generated_title": generated.generated_title,
            "generated_description": generated.generated_description,
        }

    # 4. One transaction: product, opportunity (refresh-or-insert), listing, price
    # points, and the scan job's final status.
    margin = storable_margin(result.net_margin_pct)
    payload = {
        "asin": asin,
        "title": facts.title,
        "category": facts.category,
        "image_url": facts.image_url,
        "status": status,
        "buy_price": facts.current_price,
        "target_sell_price": as_float(result.sell_price),
        "profit_margin": margin,
        "net_profit_estimate": as_float(result.net_profit),
        "net_margin_estimate": margin,
        "emergency_sell_price": as_float(emergency),
        "ai_decision": _decision_text(
            facts, analysis, result, passed, profit_settings.min_net_margin_pct, profit_settings.min_net_profit_eur
        ),
        "buybox_seller": facts.buybox_seller_label,
        "buybox_is_fba": bool(facts.buybox_is_fba),
        "deal_score": analysis.deal_score,
        "holding_period_months": analysis.holding_period_months,
        "seasonality_analysis": analysis.seasonality_analysis,
        "score_breakdown": analysis.breakdown.model_dump(),
        "willhaben_realistic_price": analysis.willhaben_realistic_price,
        "purchase_thesis": analysis.purchase_thesis,
        "listing": listing,
        "price_history": facts.price_history,
        "job_id": job_id,
    }
    persisted = await asyncio.to_thread(lambda: supabase.rpc("persist_scan_result", {"payload": payload}).execute())
    opportunity_id = persisted.data["opportunity_id"]
    SCAN_JOBS.labels("succeeded" if status == "pending" else "rejected").inc()
    logger.info("Scan of %s saved (status %s, deal score %d)", asin, status, analysis.deal_score)

    # 5. Notification: only for accepted, exceptional deals.
    if status == "pending" and analysis.deal_score >= HOT_DEAL_SCORE_THRESHOLD:
        try:
            await _alert_if_new(opportunity_id, facts, result, asin)
        except Exception:
            # The deal is saved; a failed push must not turn the job into a failure.
            logger.exception("Hot-deal notification for %s failed", asin)
