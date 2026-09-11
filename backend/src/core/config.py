from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr

class Settings(BaseSettings):
    # Supabase Settings
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: SecretStr
    
    # API Keys
    OPENAI_API_KEY: SecretStr | None = None
    KEEPA_API_KEY: SecretStr | None = None
    
    # App Settings
    ENVIRONMENT: str = "development"
    FASTAPI_SECRET_KEY: str = "default_secret_if_not_set"

    # Tell pydantic to read from the .env file in the root directory
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()