from uuid import UUID

from pydantic import BaseModel, ConfigDict


class BaseAdminSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    is_active: bool
