from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID, uuid4

import jwt
from pwdlib import PasswordHash

from app.core.dto.admin import BaseAdminSchema
from app.core.dto.auth import LoginSchema, TokenSchema
from app.core.repositories.admin_repository import AdminRepository
from app.infrastructure.config.config import settings
from app.infrastructure.database.models.admin import Admin
from app.infrastructure.errors.auth_errors import ForbiddenException, InvalidCredentials


TokenType = Literal["access", "refresh"]


class AuthService:
    def __init__(self, repository: AdminRepository):
        self.repository = repository
        self.password_hash = PasswordHash.recommended()

    async def ensure_admin(self, username: str, password: str) -> None:
        existing = await self.repository.get_by_filter(username=username)
        if existing is None:
            await self.repository.add(
                username=username,
                password_hash=self.password_hash.hash(password),
                is_active=True,
            )

    def _create_token(self, admin: Admin, token_type: TokenType) -> str:
        now = datetime.now(timezone.utc)
        lifetime = (
            timedelta(minutes=settings.access_token_expire_minutes)
            if token_type == "access"
            else timedelta(days=settings.refresh_token_expire_days)
        )
        payload = {
            "sub": str(admin.id),
            "type": token_type,
            "jti": str(uuid4()),
            "iat": now,
            "exp": now + lifetime,
        }
        return jwt.encode(
            payload,
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )

    def _create_token_pair(self, admin: Admin) -> TokenSchema:
        return TokenSchema(
            access_token=self._create_token(admin, "access"),
            refresh_token=self._create_token(admin, "refresh"),
        )

    def _decode_token(self, token: str | None, expected_type: TokenType) -> UUID:
        if token is None:
            raise ForbiddenException()

        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret_key,
                algorithms=[settings.jwt_algorithm],
            )
            if payload.get("type") != expected_type:
                raise InvalidCredentials()
            return UUID(payload["sub"])
        except (KeyError, TypeError, ValueError, jwt.PyJWTError) as exc:
            raise InvalidCredentials() from exc

    async def login_user(self, form: LoginSchema) -> TokenSchema:
        admin = await self.repository.get_by_filter(username=form.username)
        if admin is None or not self.password_hash.verify(
            form.password,
            admin.password_hash,
        ):
            raise InvalidCredentials()
        if not admin.is_active:
            raise ForbiddenException()
        return self._create_token_pair(admin)

    async def get_admin_from_access_token(
        self,
        token: str | None,
    ) -> BaseAdminSchema:
        admin_id = self._decode_token(token, "access")
        admin = await self.repository.get_by_filter(id=admin_id)
        if admin is None or not admin.is_active:
            raise ForbiddenException()
        return BaseAdminSchema.model_validate(admin)

    async def refresh_token(self, refresh_token: str) -> TokenSchema:
        admin_id = self._decode_token(refresh_token, "refresh")
        admin = await self.repository.get_by_filter(id=admin_id)
        if admin is None or not admin.is_active:
            raise ForbiddenException()
        return self._create_token_pair(admin)
