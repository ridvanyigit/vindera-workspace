"""Production configuration guard, request validation, log masking, error handling, health probes."""

import json
import logging

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, ValidationError

from src.core.config import Settings, settings
from src.core.logging_config import JsonFormatter, redact, request_id_var
from src.core.middleware import RequestContextMiddleware, UnhandledErrorMiddleware
from src.core.sentry import _scrub, init_sentry
from src.core.validation import Asin, HttpsUrl, WillhabenUrl
from src.main import app
from src.services.db_util import PAGE_SIZE, fetch_all


# --- production fail-fast ------------------------------------------------------------------

GOOD_PRODUCTION = dict(
    ENVIRONMENT="production",
    SUPABASE_URL="https://abcdefgh.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY="service-key",
    AUTOMATION_SHARED_SECRET="a" * 40,
    METRICS_TOKEN="b" * 40,
    CORS_ALLOWED_ORIGINS="https://vindera.example",
)


def production(**overrides) -> Settings:
    return Settings(_env_file=None, **{**GOOD_PRODUCTION, **overrides})


def test_a_complete_production_configuration_is_accepted():
    assert production().is_production


@pytest.mark.parametrize(
    ("override", "message"),
    [
        (dict(AUTOMATION_SHARED_SECRET=None), "AUTOMATION_SHARED_SECRET"),
        (dict(AUTOMATION_SHARED_SECRET="short"), "AUTOMATION_SHARED_SECRET"),
        (dict(METRICS_TOKEN=None), "METRICS_TOKEN"),
        (dict(METRICS_TOKEN="c" * 31), "METRICS_TOKEN"),
        (dict(SUPABASE_URL="your_supabase_project_url_here"), "SUPABASE_URL"),
        (dict(SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key_here"), "SUPABASE_SERVICE_ROLE_KEY"),
        (dict(CORS_ALLOWED_ORIGINS="https://vindera.example,http://localhost:3000"), "local origin"),
        (dict(CORS_ALLOWED_ORIGINS="http://127.0.0.1:3000"), "local origin"),
        (dict(CORS_ALLOWED_ORIGINS=""), "CORS_ALLOWED_ORIGINS"),
        (dict(ALLOW_MOCK_DATA=True), "ALLOW_MOCK_DATA must be false"),
    ],
)
def test_an_unsafe_production_configuration_refuses_to_start(override, message):
    with pytest.raises(ValidationError, match=message):
        production(**override)


def test_a_mistyped_environment_name_is_an_error_not_development():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, SUPABASE_URL="x", SUPABASE_SERVICE_ROLE_KEY="y", ENVIRONMENT="prod")


def test_the_same_choices_are_allowed_in_development():
    dev = Settings(_env_file=None, SUPABASE_URL="x", SUPABASE_SERVICE_ROLE_KEY="y", ALLOW_MOCK_DATA=True)
    assert dev.ALLOW_MOCK_DATA and not dev.is_production
    assert "localhost" in dev.CORS_ALLOWED_ORIGINS


def test_openai_counts_as_configured_only_with_a_real_value():
    def with_key(value):
        return Settings(_env_file=None, SUPABASE_URL="x", SUPABASE_SERVICE_ROLE_KEY="y", OPENAI_API_KEY=value)

    assert not with_key("").openai_configured
    assert not with_key("   ").openai_configured
    assert with_key("sk-test").openai_configured


def _run_app_in_production(tmp_path, code: str, **env_overrides):
    """Import the real app in a fresh interpreter with production settings (no network, no .env)."""
    import os
    import subprocess
    import sys
    from pathlib import Path

    workdir = tmp_path / "cwd"
    workdir.mkdir(exist_ok=True)
    env = {k: v for k, v in os.environ.items() if not k.startswith(("SUPABASE_", "AUTOMATION_", "METRICS_", "CORS_"))}
    env.update({**GOOD_PRODUCTION, "PYTHONPATH": str(Path(__file__).resolve().parents[1])}, **env_overrides)
    return subprocess.run([sys.executable, "-c", code], cwd=workdir, env=env, capture_output=True, text=True, timeout=300)


def test_the_api_docs_are_not_served_in_production(tmp_path):
    code = (
        "from fastapi.testclient import TestClient\n"
        "from src.main import app\n"
        "c = TestClient(app)\n"
        "print([c.get(p).status_code for p in ('/docs', '/redoc', '/openapi.json', '/healthz')])\n"
    )
    result = _run_app_in_production(tmp_path, code)
    assert result.returncode == 0, result.stderr[-500:]
    assert result.stdout.strip().splitlines()[-1] == "[404, 404, 404, 200]"


def test_the_app_will_not_even_import_in_production_without_a_metrics_token(tmp_path):
    result = _run_app_in_production(tmp_path, "import src.main", METRICS_TOKEN="")
    assert result.returncode != 0
    assert "METRICS_TOKEN" in result.stderr


# --- validation ------------------------------------------------------------------------------

class Body(BaseModel):
    asin: Asin
    link: HttpsUrl = None
    willhaben: WillhabenUrl = None


@pytest.mark.parametrize(("raw", "clean"), [("B09Y2MYL5C", "B09Y2MYL5C"), ("  b09y2myl5c ", "B09Y2MYL5C"), ("0123456789", "0123456789")])
def test_asin_is_trimmed_and_uppercased(raw, clean):
    assert Body(asin=raw).asin == clean


@pytest.mark.parametrize("raw", ["", "B09Y2MYL5", "B09Y2MYL5CX", "B09Y2MYL5!", "B09Y 2MYL5C", "ÄÖÜÄÖÜÄÖÜÄ", None, 1234567890])
def test_bad_asins_are_refused(raw):
    with pytest.raises(ValidationError):
        Body(asin=raw)


@pytest.mark.parametrize(
    "url", ["https://www.willhaben.at/iad/x/1", "https://willhaben.at/x", "https://WWW.WILLHABEN.AT/x", "https://m.willhaben.at/x"]
)
def test_willhaben_links_on_willhaben_are_accepted(url):
    assert Body(asin="B09Y2MYL5C", willhaben=url).willhaben == url


@pytest.mark.parametrize(
    "url",
    [
        "http://www.willhaben.at/x",                 # not https
        "https://example.com/willhaben.at",
        "https://willhaben.at.evil.com/x",           # look-alike host
        "https://evilwillhaben.at/x",
        "https://user:pw@www.willhaben.at/x",        # credentials in the link
        "javascript:alert(1)",
        "//willhaben.at/x",
        "https://www.willhaben.at/" + "a" * 2100,
    ],
)
def test_other_links_are_refused(url):
    with pytest.raises(ValidationError):
        Body(asin="B09Y2MYL5C", willhaben=url)


def test_a_blank_link_means_none_and_image_links_must_be_https():
    assert Body(asin="B09Y2MYL5C", willhaben="  ", link="").willhaben is None
    assert Body(asin="B09Y2MYL5C", link="https://cdn.example.com/a.jpg").link
    with pytest.raises(ValidationError):
        Body(asin="B09Y2MYL5C", link="http://cdn.example.com/a.jpg")


# --- secrets never reach the log ---------------------------------------------------------------

def test_credential_shapes_are_masked():
    assert redact("GET https://api.keepa.com/product?key=abc123SECRET&asin=B0TEST0001") == "GET https://api.keepa.com/product?key=***&asin=B0TEST0001"
    assert "eyJhbGciOi" not in redact("Authorization: Bearer eyJhbGciOi.payload.sig")
    assert redact("token=abc password=hunter2") == "token=*** password=***"


def test_configured_secret_values_are_masked_wherever_they_appear():
    secret = "the-configured-service-role-key"
    assert redact(f"boom {secret} boom", [secret]) == "boom *** boom"
    assert settings.AUTOMATION_SHARED_SECRET.get_secret_value() not in redact(
        "header was " + settings.AUTOMATION_SHARED_SECRET.get_secret_value()
    )


def test_log_lines_are_json_with_the_request_id_and_masked_exceptions():
    formatter = JsonFormatter()
    token = request_id_var.set("req-123456789")
    try:
        try:
            raise RuntimeError("failed calling https://x.test?api_key=SECRETVALUE")
        except RuntimeError:
            record = logging.LogRecord("t", logging.ERROR, __file__, 1, "went wrong: token=%s", ("abc",), exc_info=__import__("sys").exc_info())
        line = json.loads(formatter.format(record))
    finally:
        request_id_var.reset(token)

    assert line["request_id"] == "req-123456789" and line["level"] == "ERROR"
    assert "abc" not in line["msg"] and "SECRETVALUE" not in line["exc"]


def test_sentry_events_lose_credentials_bodies_and_user_data():
    event = {
        "request": {
            "headers": {"Authorization": "Bearer abc", "X-Vindera-Key": "k", "Accept": "json", "cookie": "s=1"},
            "data": {"amount": 60}, "cookies": {"s": "1"}, "query_string": "key=abc",
        },
        "user": {"email": "owner@example.test"},
    }
    clean = _scrub(event, {})
    assert clean["request"]["headers"] == {"Authorization": "***", "X-Vindera-Key": "***", "Accept": "json", "cookie": "***"}
    assert not {"data", "cookies", "query_string"} & set(clean["request"])
    assert "user" not in clean


def test_sentry_stays_off_without_a_dsn():
    assert init_sentry() is False


# --- error handling ----------------------------------------------------------------------------

@pytest.fixture
def crashing_client():
    inner = FastAPI()

    @inner.get("/boom")
    def boom():
        raise RuntimeError("secret internals: postgres://user:pw@host/db")

    @inner.get("/teapot")
    def teapot():
        raise HTTPException(status_code=418, detail="short and stout")

    inner.add_middleware(UnhandledErrorMiddleware)
    inner.add_middleware(RequestContextMiddleware)
    return TestClient(inner, raise_server_exceptions=False)


def test_an_unexpected_error_is_a_json_500_without_a_stack_trace(crashing_client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    response = crashing_client.get("/boom", headers={"X-Request-Id": "abcdef123456"})

    assert response.status_code == 500
    body = response.json()
    assert body == {"detail": "Internal server error.", "request_id": "abcdef123456"}
    assert "secret internals" not in response.text and "Traceback" not in response.text
    assert response.headers["x-request-id"] == "abcdef123456"


def test_outside_production_the_error_type_is_shown_for_debugging(crashing_client):
    assert crashing_client.get("/boom").json()["error"] == "RuntimeError"


def test_normal_http_errors_pass_through_untouched(crashing_client):
    response = crashing_client.get("/teapot")
    assert response.status_code == 418 and response.json() == {"detail": "short and stout"}


@pytest.mark.parametrize("sent", ["short", "has spaces in it", "x" * 65, "bad;chars-here"])
def test_an_unsafe_request_id_is_replaced(crashing_client, sent):
    returned = crashing_client.get("/teapot", headers={"X-Request-Id": sent}).headers["x-request-id"]
    assert returned != sent and len(returned) == 32


# --- health probes ---------------------------------------------------------------------------------

def test_liveness_never_touches_the_database(db):
    db.failures["business_settings"] = RuntimeError("database down")
    assert TestClient(app).get("/healthz").json() == {"status": "ok"}


def test_readiness_follows_the_database_and_reveals_nothing(db):
    client = TestClient(app)
    db.seed("business_settings", {"id": 1})
    assert client.get("/readyz").json() == {"status": "ready"}

    db.failures["business_settings"] = RuntimeError("password authentication failed for user postgres")
    response = client.get("/readyz")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


def test_the_old_public_root_route_is_gone():
    assert TestClient(app).get("/").status_code == 404


# --- paging helper -----------------------------------------------------------------------------------

def test_fetch_all_reads_past_the_1000_row_cap(db):
    db.seed("expenses_test", *[{"id": f"{i:05d}"} for i in range(PAGE_SIZE * 2 + 5)])
    rows = fetch_all(lambda: db.table("expenses_test").select("*").order("id"))
    assert len(rows) == PAGE_SIZE * 2 + 5
    assert len({row["id"] for row in rows}) == len(rows)
