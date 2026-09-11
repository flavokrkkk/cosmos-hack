from uuid import UUID

from app.core.clients.ollama_client import OllamaClient
from app.core.repositories.portfolio_explanation_repository import PortfolioExplanationRepository
from app.core.services.ollama_service import OllamaService
from app.core.services.portfolio_explanation_service import PortfolioExplanationService
from app.infrastructure.config.config import settings
from app.infrastructure.database.adapters.pg_connection import DatabaseConnection
from app.tasks.broker import broker


@broker.task
async def generate_portfolio_explanation(job_id: str) -> None:
    database = DatabaseConnection(settings.database.url)
    client = OllamaClient(
        settings.ollama.base_url,
        settings.ollama.timeout_seconds,
        settings.ollama.username,
        settings.ollama.password.get_secret_value() if settings.ollama.password else None,
    )
    try:
        async with database.session_factory() as session:
            service = PortfolioExplanationService(PortfolioExplanationRepository(session))
            await service.run(UUID(job_id), OllamaService(client, settings.ollama.model))
    finally:
        await client.close()
        await database.close()
