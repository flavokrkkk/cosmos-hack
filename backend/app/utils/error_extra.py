from app.infrastructure.errors.base import BaseAPIException


def error_response(exception: type[BaseAPIException]) -> dict[int, dict]:
    return {
        exception.status_code: {
            "description": exception.detail,
            "content": {
                "application/json": {
                    "example": {"detail": exception.detail},
                },
            },
        },
    }
