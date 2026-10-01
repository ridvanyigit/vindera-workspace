"""Module 10 (LLMOps curriculum): an Airflow rebuild of n8n/Vindera_Daily_Scan.json,
for a side-by-side comparison of the two orchestration approaches.

n8n's own production workflow is never touched - this is a separate, local,
code-first equivalent of the exact same three calls:

  1. GET  /api/v1/deals/watchlist        (retried 3x, 5s apart - matches the n8n node)
  2. POST /api/v1/deals/scan             once per ASIN, fanned out (no retry - matches n8n)
  3. POST /api/v1/deals/dead-stock/scan  once, in parallel with the watchlist branch (no retry - matches n8n)

Same cron schedule (08:15 daily) and the same X-Vindera-Key header as the n8n workflow.
"""

from __future__ import annotations

import pendulum
import requests
from airflow.decorators import dag, task
from airflow.models import Variable

# Real gotcha found while building this: a Variable.get() call at true module
# top level runs at DAG-PARSE time, not task-execution time - the dag-processor
# re-parses every DAG file on a schedule, and in Airflow 3's Task SDK that
# means a real (and here, failing) network round trip to the API server on
# every single parse. Airflow's own docs call top-level Variable access in a
# DAG file an anti-pattern for exactly this reason. Fixed by moving both
# lookups inside plain functions, called only from within @task bodies (task
# EXECUTION time, once per run - the correct place for this).
def _api_base_url() -> str:
    return Variable.get("VINDERA_API_BASE_URL", default_var="http://host.docker.internal:8000")


def _auth_header() -> dict[str, str]:
    return {"X-Vindera-Key": Variable.get("VINDERA_AUTOMATION_KEY", default_var="")}


@dag(
    dag_id="vindera_daily_scan",
    schedule="15 8 * * *",  # identical cron to n8n's "Schedule Trigger (08:15 AM)"
    start_date=pendulum.datetime(2026, 1, 1, tz="Europe/Vienna"),
    catchup=False,
    default_args={"retries": 0},  # n8n only retries the watchlist fetch, not the scan/dead-stock calls - matched exactly
    tags=["vindera", "module-10"],
)
def vindera_daily_scan():
    @task(retries=3, retry_delay=pendulum.duration(seconds=5))  # matches n8n's Fetch Watchlist: retryOnFail, maxTries=3, waitBetweenTries=5000ms
    def fetch_watchlist() -> list[str]:
        response = requests.get(f"{_api_base_url()}/api/v1/deals/watchlist", headers=_auth_header(), timeout=30)
        response.raise_for_status()
        return response.json()["asins"]

    @task
    def trigger_deal_scan(asin: str) -> None:
        response = requests.post(
            f"{_api_base_url()}/api/v1/deals/scan", headers=_auth_header(), json={"asin": asin}, timeout=30
        )
        response.raise_for_status()

    @task
    def trigger_dead_stock_check() -> None:
        response = requests.post(
            f"{_api_base_url()}/api/v1/deals/dead-stock/scan", headers=_auth_header(), timeout=30
        )
        response.raise_for_status()

    asins = fetch_watchlist()
    # Dynamic task mapping: one mapped task instance per ASIN, run in parallel -
    # the code-first equivalent of n8n's "Split Watchlist" + implicit per-item loop.
    trigger_deal_scan.expand(asin=asins)
    trigger_dead_stock_check()


vindera_daily_scan()
