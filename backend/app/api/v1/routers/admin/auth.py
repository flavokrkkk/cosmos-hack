from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.v1.dependencies import get_auth_service, get_current_user
from app.core.dto.admin import BaseAdminSchema
from app.core.dto.auth import LoginSchema, RefreshTokenSchema, TokenSchema
from app.core.services.auth_service import AuthService
from app.infrastructure.errors.auth_errors import InvalidCredentials
from app.utils.error_extra import error_response


router = APIRouter()


@router.post(
    "/login",
    response_model=TokenSchema,
    responses=error_response(InvalidCredentials),
)
async def login(
    form: LoginSchema,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenSchema:
    return await auth_service.login_user(form)


@router.get("/current_user", response_model=BaseAdminSchema)
async def get_current_user_info(
    current_user: Annotated[BaseAdminSchema, Depends(get_current_user)],
) -> BaseAdminSchema:
    return current_user


@router.post(
    "/refresh",
    response_model=TokenSchema,
    responses=error_response(InvalidCredentials),
)
async def refresh(
    data: RefreshTokenSchema,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenSchema:
    return await auth_service.refresh_token(data.refresh_token)
