from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_prefix="COSMOS_",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Cosmos Hack API"
    debug: bool = False
    cors_allowed_origins: str = "http://localhost:5173"
    slow_request_threshold: float = 1.0

    db_name: str = "cosmos_hack"
    db_user: str = "cosmos_hack"
    db_pass: str = "cosmos_hack"
    db_host: str = "localhost"
    db_port: int = 5432

    jwt_secret_key: str = Field(
        default="dev-secret-change-in-production-at-least-32-bytes",
        min_length=32,
    )
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    bootstrap_admin_username: str | None = None
    bootstrap_admin_password: str | None = None
    redis_url: str = "redis://localhost:6379/0"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:4b"
    ollama_timeout_seconds: float = 180.0

    @property
    def database_url(self) -> str:
        return (
            "postgresql+asyncpg://"
            f"{self.db_user}:{self.db_pass}@{self.db_host}:{self.db_port}/"
            f"{self.db_name}"
        )

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_allowed_origins.split(",")]


settings = Settings()
