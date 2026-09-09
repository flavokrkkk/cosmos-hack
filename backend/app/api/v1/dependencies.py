from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dto.admin import BaseAdminSchema
from app.core.repositories.admin_repository import AdminRepository
from app.core.services.auth_service import AuthService
from app.core.services.ollama_service import OllamaService


token_scheme = HTTPBearer(auto_error=False)


async def get_db_session(request: Request) -> AsyncGenerator[AsyncSession, None]:
    async with request.app.state.db_connection.session_factory() as session:
        yield session


async def get_auth_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuthService:
    return AuthService(AdminRepository(session))


async def get_ollama_service(request: Request) -> OllamaService:
    return request.app.state.ollama_service


async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(token_scheme),
    ],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> BaseAdminSchema:
    token = credentials.credentials if credentials else None
    return await auth_service.get_admin_from_access_token(token)
