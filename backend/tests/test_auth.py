"""Authentication: admin token, automation key, metrics token, and the guard that keeps /api/v1 closed."""

import re
import uuid

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from supabase import AuthRetryableError

from src.core import auth
from src.core.auth import (
    _iter_api_routes,
    assert_routes_protected,
    list_unprotected_routes,
    require_admin,
    require_admin_or_automation,
)
from src.core.config import settings
from src.main import API_PREFIX, app as real_app

# A token only has to look like a JWT (three dot-separated parts); the fake decides whether it is valid.
ADMIN_TOKEN = "aaaa.bbbb.cccc"
PLAIN_TOKEN = "dddd.eeee.ffff"
AUTOMATION_KEY = settings.AUTOMATION_SHARED_SECRET.get_secret_value()


@pytest.fixture
def client(db):
    """A tiny app with one route per dependency, so the tests do not depend on real endpoints."""
    app = FastAPI()

    @app.get("/admin-only")
    async def admin_only(principal=Depends(require_admin)):
        return {"method": principal.method, "user": principal.user_id}

    @app.get("/scan-like")
    async def scan_like(principal=Depends(require_admin_or_automation)):
        return {"method": principal.method}

    db.add_admin(ADMIN_TOKEN)
    db.add_plain_user(PLAIN_TOKEN)
    return TestClient(app)


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


# --- admin token -------------------------------------------------------------

def test_admin_token_is_accepted(client):
    response = client.get("/admin-only", headers=bearer(ADMIN_TOKEN))
    assert response.status_code == 200
    assert response.json() == {"method": "admin", "user": "admin-1"}


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": ""}, {"Authorization": "Bearer"}, {"Authorization": "Basic abc.def.ghi"}, {"Authorization": "Token abc.def.ghi"}],
)
def test_missing_or_malformed_authorization_is_401(client, headers):
    response = client.get("/admin-only", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_garbage_tokens_are_rejected_without_asking_supabase(client, db):
    for token in ("not-a-jwt", "one.two", "a.b.c.d", "x" * 5000 + ".b.c"):
        assert client.get("/admin-only", headers=bearer(token)).status_code == 401
    assert db.auth.calls == 0


def test_unknown_token_is_401(client):
    assert client.get("/admin-only", headers=bearer("zzzz.yyyy.xxxx")).status_code == 401


def test_a_signed_in_user_who_is_not_an_admin_is_403(client):
    response = client.get("/admin-only", headers=bearer(PLAIN_TOKEN))
    assert response.status_code == 403


def test_a_removed_admin_is_403(client, db):
    db.tables["admin_users"].clear()
    assert client.get("/admin-only", headers=bearer(ADMIN_TOKEN)).status_code == 403


def test_supabase_outage_is_503_not_a_pass(client, db):
    db.auth.error = AuthRetryableError("unreachable", 502)
    assert client.get("/admin-only", headers=bearer(ADMIN_TOKEN)).status_code == 503
    db.auth.error = RuntimeError("boom")
    assert client.get("/admin-only", headers=bearer(ADMIN_TOKEN)).status_code == 503


def test_admin_lookup_is_cached_but_only_for_successes(client, db):
    for _ in range(3):
        assert client.get("/admin-only", headers=bearer(ADMIN_TOKEN)).status_code == 200
    assert db.auth.calls == 1

    for _ in range(2):
        assert client.get("/admin-only", headers=bearer(PLAIN_TOKEN)).status_code == 403
    assert db.auth.calls == 3  # the denial was looked up again each time


def test_cache_expires(client, db, monkeypatch):
    monkeypatch.setattr(auth, "ADMIN_CACHE_TTL_SECONDS", 0)
    client.get("/admin-only", headers=bearer(ADMIN_TOKEN))
    client.get("/admin-only", headers=bearer(ADMIN_TOKEN))
    assert db.auth.calls == 2


def test_cache_never_stores_the_raw_token(client):
    client.get("/admin-only", headers=bearer(ADMIN_TOKEN))
    assert ADMIN_TOKEN not in auth._admin_cache
    assert all(re.fullmatch(r"[0-9a-f]{64}", key) for key in auth._admin_cache)


# --- automation key ----------------------------------------------------------

def test_automation_key_opens_the_scan_route_only(client):
    assert client.get("/scan-like", headers={"X-Vindera-Key": AUTOMATION_KEY}).json() == {"method": "automation"}
    assert client.get("/admin-only", headers={"X-Vindera-Key": AUTOMATION_KEY}).status_code == 401


def test_wrong_automation_key_is_401_even_with_a_valid_admin_token(client):
    response = client.get("/scan-like", headers={"X-Vindera-Key": "wrong", **bearer(ADMIN_TOKEN)})
    assert response.status_code == 401


def test_an_empty_or_unset_secret_never_matches(client, monkeypatch):
    assert client.get("/scan-like", headers={"X-Vindera-Key": ""}).status_code == 401
    monkeypatch.setattr(settings, "AUTOMATION_SHARED_SECRET", None)
    assert client.get("/scan-like", headers={"X-Vindera-Key": AUTOMATION_KEY}).status_code == 401
    assert client.get("/scan-like", headers={"X-Vindera-Key": ""}).status_code == 401


def test_scan_route_also_accepts_an_admin_token(client):
    assert client.get("/scan-like", headers=bearer(ADMIN_TOKEN)).json() == {"method": "admin"}
    assert client.get("/scan-like").status_code == 401


# --- /metrics ----------------------------------------------------------------

def test_metrics_needs_the_token():
    client = TestClient(real_app)
    token = settings.METRICS_TOKEN.get_secret_value()
    assert client.get("/metrics").status_code == 401
    assert client.get("/metrics", headers=bearer("wrong-token")).status_code == 401
    assert client.get("/metrics", headers=bearer(token)).status_code == 200


def test_metrics_is_open_only_while_no_token_is_configured(monkeypatch):
    monkeypatch.setattr(settings, "METRICS_TOKEN", None)
    assert TestClient(real_app).get("/metrics").status_code == 200


# --- the whole real API ------------------------------------------------------

def _api_routes():
    return [(path, route) for path, route in _iter_api_routes(real_app.routes) if path.startswith(API_PREFIX)]


def test_the_real_api_has_routes_and_none_is_unprotected():
    assert len(_api_routes()) >= 15
    assert list_unprotected_routes(real_app, API_PREFIX) == []


def test_every_api_route_answers_401_without_credentials():
    client = TestClient(real_app)
    for path, route in _api_routes():
        url = re.sub(r"\{[^}]+\}", str(uuid.uuid4()), path)
        for method in route.methods - {"HEAD", "OPTIONS"}:
            response = client.request(method, url)
            assert response.status_code == 401, f"{method} {url} answered {response.status_code}"


def test_public_endpoints_are_only_the_health_probes(db):
    public = {"/healthz", "/readyz"}
    client = TestClient(real_app)
    db.tables["business_settings"] = [{"id": 1}]
    for path in public:
        assert client.get(path).status_code == 200


def test_the_guard_refuses_an_unprotected_route():
    from fastapi import APIRouter

    app = FastAPI()
    router = APIRouter(prefix="/api/v1/oops")

    @router.get("/open")
    def open_route():
        return {}

    app.include_router(router)
    with pytest.raises(RuntimeError, match="Unauthenticated API routes"):
        assert_routes_protected(app, "/api/v1")


def test_the_guard_notices_when_it_finds_no_routes_at_all():
    with pytest.raises(RuntimeError, match="found no routes"):
        assert_routes_protected(FastAPI(), "/api/v1")
