from typing import Any, Generic, TypeVar

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models.base import Base


ModelT = TypeVar("ModelT", bound=Base)


class SqlAlchemyRepository(Generic[ModelT]):
    def __init__(self, session: AsyncSession, model: type[ModelT]):
        self.session = session
        self.model = model

    async def get_by_filter(self, **filters: Any) -> ModelT | None:
        query = select(self.model).filter_by(**filters)
        return await self.session.scalar(query)

    async def get_item(self, item_id: Any) -> ModelT | None:
        return await self.session.get(self.model, item_id)

    async def get_all_items(
        self,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[ModelT]:
        query = select(self.model)
        if limit is not None:
            query = query.limit(limit)
        if offset is not None:
            query = query.offset(offset)
        result = await self.session.scalars(query)
        return list(result.all())

    async def add(self, **data: Any) -> ModelT:
        item = self.model(**data)
        self.session.add(item)
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def update_item(self, item_id: Any, **data: Any) -> ModelT | None:
        query = (
            update(self.model)
            .where(self.model.id == item_id)
            .values(**data)
            .returning(self.model)
        )
        item = await self.session.scalar(query)
        await self.session.commit()
        return item

    async def delete_item(self, item: ModelT) -> None:
        await self.session.delete(item)
        await self.session.commit()
