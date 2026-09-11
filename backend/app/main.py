from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.api.v1.routers import api_v1_routers
from app.core.clients.ollama_client import OllamaClient
from app.core.repositories.admin_repository import AdminRepository
from app.core.services.auth_service import AuthService
from app.core.services.ollama_service import OllamaService
from app.core.services.recommendation_service import RecommendationService
from app.infrastructure.config.config import settings
from app.infrastructure.database.adapters.pg_connection import DatabaseConnection
from app.infrastructure.logging.logger import configure_logging, get_logger
from app.infrastructure.middleware.logging_middleware import LoggingMiddleware


configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("application_startup", app_name=settings.app.name, debug=settings.app.debug)
    database = DatabaseConnection(settings.database.url)
    await database.initialize()
    app.state.db_connection = database
    logger.info("database_connected")

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

    if settings.bootstrap.admin_username and settings.bootstrap.admin_password:
        async with database.session_factory() as session:
            service = AuthService(AdminRepository(session))
            await service.ensure_admin(
                settings.bootstrap.admin_username,
                settings.bootstrap.admin_password,
            )

    try:
        await run_in_threadpool(RecommendationService().warmup)
        logger.info("portfolio_engine_ready")
        yield
    finally:
        await ollama_client.close()
        await database.close()
        logger.info("application_shutdown")


app = FastAPI(
    title=settings.app.name,
    debug=settings.app.debug,
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
