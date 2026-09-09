from typing import Generic, TypeVar

from app.core.repositories.base import SqlAlchemyRepository
from app.infrastructure.database.models.base import Base


ModelT = TypeVar("ModelT", bound=Base)


class BaseDbModelService(Generic[ModelT]):
    def __init__(self, repository: SqlAlchemyRepository[ModelT]):
        self.repository = repository
