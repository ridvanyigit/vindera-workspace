from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Supabase -------------------------------------------------------
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: SecretStr

    # --- External APIs (optional: each falls back to mock data) ----------
    OPENAI_API_KEY: SecretStr | None = None
    KEEPA_API_KEY: SecretStr | None = None

    # --- Pushover notifications -----------------------------------------
    PUSHOVER_USER_KEY: SecretStr | None = None
    PUSHOVER_API_TOKEN: SecretStr | None = None

    # --- Application ----------------------------------------------------
    ENVIRONMENT: str = "development"
    FASTAPI_SECRET_KEY: str = "default_secret_if_not_set"

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


settings = Settings()
