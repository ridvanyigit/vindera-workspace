from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: SecretStr
    
    OPENAI_API_KEY: SecretStr | None = None
    KEEPA_API_KEY: SecretStr | None = None
    
    # Pushover Notifications
    PUSHOVER_USER_KEY: SecretStr | None = None
    PUSHOVER_API_TOKEN: SecretStr | None = None
    
    ENVIRONMENT: str = "development"
    FASTAPI_SECRET_KEY: str = "default_secret_if_not_set"

    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()