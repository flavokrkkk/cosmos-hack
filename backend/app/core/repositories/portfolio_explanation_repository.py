from sqlalchemy.ext.asyncio import AsyncSession

from app.core.repositories.base import SqlAlchemyRepository
from app.infrastructure.database.models.portfolio_explanation_job import PortfolioExplanationJob


class PortfolioExplanationRepository(SqlAlchemyRepository[PortfolioExplanationJob]):
    def __init__(self, session: AsyncSession):
        super().__init__(session, PortfolioExplanationJob)
