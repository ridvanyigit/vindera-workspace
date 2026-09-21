from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Hosts that must never appear in the production CORS allow-list.
_LOCAL_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "[::1]")

# Shared secrets must be long enough that guessing them is not a realistic attack
# (`openssl rand -hex 32` yields 64 characters).
_MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    # --- Supabase -------------------------------------------------------
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: SecretStr

    # --- External APIs (optional; see ALLOW_MOCK_DATA for the fallback) ---
    OPENAI_API_KEY: SecretStr | None = None
    KEEPA_API_KEY: SecretStr | None = None

    # --- Pushover notifications -----------------------------------------
    PUSHOVER_USER_KEY: SecretStr | None = None
    PUSHOVER_API_TOKEN: SecretStr | None = None

    # --- Application ----------------------------------------------------
    # A Literal on purpose: a typo such as "prod" must fail at startup instead
    # of silently running with development behaviour.
    ENVIRONMENT: Literal["development", "test", "production"] = "development"

    # Shared secret the n8n workflow sends as `X-Vindera-Key` to trigger scans.
    AUTOMATION_SHARED_SECRET: SecretStr | None = None

    # Bearer token Prometheus presents when scraping `/metrics`.
    METRICS_TOKEN: SecretStr | None = None

    # Error tracking; unset disables Sentry entirely.
    SENTRY_DSN: SecretStr | None = None

    # Mock Keepa / OpenAI data is a development aid only. It can never be
    # enabled in production (enforced below).
    ALLOW_MOCK_DATA: bool = False

    # Amazon.de return window used to compute `return_by` after a purchase.
    RETURN_WINDOW_DAYS: int = 30

    # Model used for the deal analysis and the listing copy.
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Where the suggested Willhaben price sits between today's Amazon price (0.0)
    # and its 90-day reference price (1.0). 0.5 = exactly halfway.
    SELL_PRICE_POSITION: float = Field(default=0.5, gt=0, le=1)

    # Comma-separated list of origins allowed to call the API.
    # Covers the Next.js dev server on both its default port and the fallback
    # it picks when 3000 is taken. Set the production domain in .env.
    CORS_ALLOWED_ORIGINS: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001"
    )

    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @model_validator(mode="after")
    def _enforce_production_requirements(self) -> "Settings":
        """Refuse to start in production with an unsafe or incomplete configuration."""
        if not self.is_production:
            return self

        problems: list[str] = []

        if not self.SUPABASE_URL.strip() or self.SUPABASE_URL.startswith("your_"):
            problems.append("SUPABASE_URL is missing")
        service_key = self.SUPABASE_SERVICE_ROLE_KEY.get_secret_value().strip()
        if not service_key or service_key.startswith("your_"):
            problems.append("SUPABASE_SERVICE_ROLE_KEY is missing")

        for name in ("AUTOMATION_SHARED_SECRET", "METRICS_TOKEN"):
            secret: SecretStr | None = getattr(self, name)
            if secret is None or len(secret.get_secret_value()) < _MIN_SECRET_LENGTH:
                problems.append(f"{name} must be set to a random value of at least {_MIN_SECRET_LENGTH} characters")

        for origin in self.cors_allowed_origins:
            if any(host in origin.lower() for host in _LOCAL_HOSTS):
                problems.append(f"CORS_ALLOWED_ORIGINS contains a local origin ({origin})")

        if not self.cors_allowed_origins:
            problems.append("CORS_ALLOWED_ORIGINS must list the production frontend origin")

        if self.ALLOW_MOCK_DATA:
            problems.append("ALLOW_MOCK_DATA must be false")

        if problems:
            raise ValueError("Unsafe production configuration: " + "; ".join(problems))

        return self


settings = Settings()
