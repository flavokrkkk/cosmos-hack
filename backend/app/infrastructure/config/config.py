from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[3]


class Config(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_prefix="COSMOS_",
        case_sensitive=False,
        extra="ignore",
    )


class AppSettings(Config):
    name: str = Field("Cosmos Hack API", validation_alias="COSMOS_APP_NAME")
    debug: bool = Field(False, validation_alias="COSMOS_DEBUG")
    cors_allowed_origins: str = Field(
        "http://localhost:5173",
        validation_alias="COSMOS_CORS_ALLOWED_ORIGINS",
    )
    slow_request_threshold: float = Field(
        1.0,
        validation_alias="COSMOS_SLOW_REQUEST_THRESHOLD",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_allowed_origins.split(",")]


class DatabaseSettings(Config):
    name: str = Field("cosmos_hack", validation_alias="COSMOS_DB_NAME")
    user: str = Field("cosmos_hack", validation_alias="COSMOS_DB_USER")
    password: str = Field("cosmos_hack", validation_alias="COSMOS_DB_PASS")
    host: str = Field("localhost", validation_alias="COSMOS_DB_HOST")
    port: int = Field(5432, validation_alias="COSMOS_DB_PORT")

    @property
    def url(self) -> str:
        return (
            "postgresql+asyncpg://"
            f"{self.user}:{self.password}@{self.host}:{self.port}/{self.name}"
        )


class JWTSettings(Config):
    secret_key: str = Field(
        default="dev-secret-change-in-production-at-least-32-bytes",
        min_length=32,
        validation_alias="COSMOS_JWT_SECRET_KEY",
    )
    algorithm: str = Field("HS256", validation_alias="COSMOS_JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(
        30,
        validation_alias="COSMOS_ACCESS_TOKEN_EXPIRE_MINUTES",
    )
    refresh_token_expire_days: int = Field(
        7,
        validation_alias="COSMOS_REFRESH_TOKEN_EXPIRE_DAYS",
    )


class BootstrapSettings(Config):
    admin_username: str | None = Field(
        None,
        validation_alias="COSMOS_BOOTSTRAP_ADMIN_USERNAME",
    )
    admin_password: str | None = Field(
        None,
        validation_alias="COSMOS_BOOTSTRAP_ADMIN_PASSWORD",
    )


class RedisSettings(Config):
    url: str = Field("redis://localhost:6379/0", validation_alias="COSMOS_REDIS_URL")


class OllamaSettings(Config):
    base_url: str = Field(
        "http://localhost:11434",
        validation_alias="COSMOS_OLLAMA_BASE_URL",
    )
    model: str = Field("qwen3:4b", validation_alias="COSMOS_OLLAMA_MODEL")
    timeout_seconds: float = Field(
        180.0,
        validation_alias="COSMOS_OLLAMA_TIMEOUT_SECONDS",
    )
    username: str | None = Field(
        None,
        validation_alias="COSMOS_OLLAMA_USERNAME",
    )
    password: SecretStr | None = Field(
        None,
        validation_alias="COSMOS_OLLAMA_PASSWORD",
    )


class Settings:
    def __init__(self) -> None:
        self.app = AppSettings()
        self.database = DatabaseSettings()
        self.jwt = JWTSettings()
        self.bootstrap = BootstrapSettings()
        self.redis = RedisSettings()
        self.ollama = OllamaSettings()


settings = Settings()
