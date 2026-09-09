from fastapi import HTTPException, status


class BaseAPIException(HTTPException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    detail = "Внутренняя ошибка сервера"

    def __init__(
        self,
        status_code: int,
        detail: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=headers)


class NotFoundException(BaseAPIException):
    status_code = status.HTTP_404_NOT_FOUND
    detail = "Ресурс не найден"

    def __init__(self, detail: str = detail) -> None:
        super().__init__(status_code=self.status_code, detail=detail)


class BadRequestException(BaseAPIException):
    status_code = status.HTTP_400_BAD_REQUEST
    detail = "Некорректный запрос"

    def __init__(self, detail: str = detail) -> None:
        super().__init__(status_code=self.status_code, detail=detail)


class InternalServerError(BaseAPIException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    detail = "Внутренняя ошибка сервера"

    def __init__(self, detail: str = detail) -> None:
        super().__init__(status_code=self.status_code, detail=detail)
