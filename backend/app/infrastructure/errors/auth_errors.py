from fastapi import status

from app.infrastructure.errors.base import BaseAPIException


class InvalidCredentials(BaseAPIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    detail = "Invalid credentials"

    def __init__(self):
        super().__init__(
            status_code=self.status_code,
            detail=self.detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenException(BaseAPIException):
    status_code = status.HTTP_403_FORBIDDEN
    detail = "Forbidden"

    def __init__(self):
        super().__init__(
            status_code=self.status_code,
            detail=self.detail,
        )
