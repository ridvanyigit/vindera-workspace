"""Test harness: no test may reach Supabase, Keepa, OpenAI or Pushover, or read the owner's `.env`.

Three layers keep that true, in this order:

1. Settings come from the environment set below. `Settings` also reads `../.env`
   relative to the working directory, so the import happens from a scratch
   directory whose parent holds no `.env`, and the values are asserted afterwards.
2. Every `supabase` client used by the application is replaced by the in-memory
   `FakeSupabase` (see `tests/fakes.py`) for the duration of a test.
3. Outgoing network connections are refused at the socket level, so a test that
   forgets to stub something fails loudly instead of calling a real service.
"""

import os
import socket
import sys
import tempfile
from pathlib import Path

import pytest

TEST_ENV = {
    "ENVIRONMENT": "test",
    "SUPABASE_URL": "http://supabase.invalid",
    "SUPABASE_SERVICE_ROLE_KEY": "test-service-role-key-not-a-real-key",
    "OPENAI_API_KEY": "",
    "KEEPA_API_KEY": "",
    "PUSHOVER_USER_KEY": "",
    "PUSHOVER_API_TOKEN": "",
    "SENTRY_DSN": "",
    "AUTOMATION_SHARED_SECRET": "test-automation-secret-0123456789abcdef",
    "METRICS_TOKEN": "test-metrics-token-0123456789abcdef0123",
    "ALLOW_MOCK_DATA": "false",
    "CORS_ALLOWED_ORIGINS": "http://localhost:3000",
    "LOG_LEVEL": "WARNING",
}
os.environ.update(TEST_ENV)

# `env_file="../.env"` is resolved against the working directory: import the app from
# a directory whose parent has no `.env`, then come back.
_here = Path.cwd()
_scratch = Path(tempfile.mkdtemp(prefix="vindera-tests-")) / "cwd"
_scratch.mkdir()
os.chdir(_scratch)
try:
    from src.core import config as _config  # noqa: E402  (must come after the environment is set)
    import src.main  # noqa: E402,F401  (registers every module that holds a supabase client)
finally:
    os.chdir(_here)

assert _config.settings.SUPABASE_URL == TEST_ENV["SUPABASE_URL"], "tests must never load real settings"
assert not _config.settings.openai_configured
assert _config.settings.KEEPA_API_KEY is None or not _config.settings.KEEPA_API_KEY.get_secret_value()

from src.core import database  # noqa: E402

from tests.fakes import FakeSupabase  # noqa: E402

_REAL_CLIENT = database.supabase


@pytest.fixture(autouse=True)
def _block_network(monkeypatch):
    """Refuse every internet connection. In-process ASGI calls and socketpairs are unaffected."""
    real_connect = socket.socket.connect

    def guarded(self, address, *args, **kwargs):
        if self.family in (socket.AF_INET, socket.AF_INET6):
            raise RuntimeError(f"Network access is blocked in tests (tried to connect to {address!r})")
        return real_connect(self, address, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", guarded)


@pytest.fixture(autouse=True)
def _reset_caches():
    from src.core.auth import clear_admin_cache
    from src.services import business_settings

    from src.core.rate_limit import limiter

    clear_admin_cache()
    business_settings._cache = None
    limiter.reset()
    yield
    clear_admin_cache()
    business_settings._cache = None


@pytest.fixture
def db(monkeypatch) -> FakeSupabase:
    """An empty in-memory Supabase, installed everywhere the application imported the real client."""
    fake = FakeSupabase()
    for name, module in list(sys.modules.items()):
        if name.startswith("src.") and getattr(module, "supabase", None) is _REAL_CLIENT:
            monkeypatch.setattr(module, "supabase", fake)
    return fake
