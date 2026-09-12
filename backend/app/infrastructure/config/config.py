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
    root_path: str = Field("", validation_alias="COSMOS_ROOT_PATH")
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


class OllamaSettings(Config):
    enabled: bool = Field(False, validation_alias="COSMOS_OLLAMA_ENABLED")
    base_url: str = Field(
        "http://localhost:11434",
        validation_alias="COSMOS_OLLAMA_BASE_URL",
    )
    model: str = Field("qwen3:4b-instruct", validation_alias="COSMOS_OLLAMA_MODEL")
    timeout_seconds: float = Field(
        45.0,
        validation_alias="COSMOS_OLLAMA_TIMEOUT_SECONDS",
    )
    parallel_requests: int = Field(
        2,
        ge=1,
        le=5,
        validation_alias="COSMOS_OLLAMA_PARALLEL_REQUESTS",
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
        self.ollama = OllamaSettings()


settings = Settings()
