"""Business metrics exposed next to the HTTP metrics on `/metrics`.

They live in the default prometheus_client registry, which the FastAPI
instrumentator already serves. Counters and gauges are per process, so run the
backend with a single worker (or add Prometheus multiprocess mode first).
"""

from prometheus_client import Counter, Gauge

SCAN_JOBS = Counter(
    "vindera_scan_jobs_total",
    "Scan jobs by final outcome.",
    ["status"],  # succeeded | rejected | failed
)

KEEPA_TOKENS_LEFT = Gauge(
    "vindera_keepa_tokens_left",
    "Keepa API tokens left, as reported by the last Keepa response.",
)

# NaN until Keepa has answered once: an unset gauge would export 0 and the
# "tokens low" alert (< 20) would fire on a fresh start. NaN compares false.
KEEPA_TOKENS_LEFT.set(float("nan"))

OPENAI_ERRORS = Counter(
    "vindera_openai_errors_total",
    "Failed OpenAI calls (analysis, listing copy, chat).",
)

# learn/llmops Module 6: input-guardrail hits (a scan blocked before reaching an agent).
PROMPT_INJECTION_BLOCKED = Counter(
    "vindera_prompt_injection_blocked_total",
    "Scans blocked because Keepa's title/category looked like a prompt injection attempt.",
)
