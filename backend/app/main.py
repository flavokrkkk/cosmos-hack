from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.api.v1.routers import api_v1_routers
from app.core.clients.ollama_client import OllamaClient
from app.core.services.ollama_service import OllamaService
from app.core.services.recommendation_service import RecommendationService
from app.infrastructure.config.config import settings
from app.infrastructure.logging.logger import configure_logging, get_logger
from app.infrastructure.middleware.logging_middleware import LoggingMiddleware


configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("application_startup", app_name=settings.app.name, debug=settings.app.debug)

    ollama_client = OllamaClient(
        settings.ollama.base_url,
        settings.ollama.timeout_seconds,
        settings.ollama.username,
        (
            settings.ollama.password.get_secret_value()
            if settings.ollama.password
            else None
        ),
    )
    app.state.ollama_service = OllamaService(
        ollama_client,
        settings.ollama.model,
    )
    logger.info(
        "ollama_client_configured",
        base_url=settings.ollama.base_url,
        model=settings.ollama.model,
    )

    try:
        await run_in_threadpool(RecommendationService().warmup)
        logger.info("portfolio_engine_ready")
        yield
    finally:
        await ollama_client.close()
        logger.info("application_shutdown")


app = FastAPI(
    title=settings.app.name,
    debug=settings.app.debug,
    root_path=settings.app.root_path,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.app.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(LoggingMiddleware)
app.include_router(api_v1_routers)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
