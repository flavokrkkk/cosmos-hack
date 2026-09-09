from sqlalchemy.ext.asyncio import AsyncSession

from app.core.repositories.base import SqlAlchemyRepository
from app.infrastructure.database.models.admin import Admin


class AdminRepository(SqlAlchemyRepository[Admin]):
    def __init__(self, session: AsyncSession):
        super().__init__(session, Admin)
