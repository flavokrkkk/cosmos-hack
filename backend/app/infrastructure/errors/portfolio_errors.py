from app.infrastructure.errors.base import BaseAPIException


class InvalidPortfolio(BaseAPIException):
    def __init__(self, detail: str) -> None:
        super().__init__(status_code=422, detail=detail)


class DatasetMismatch(BaseAPIException):
    def __init__(self) -> None:
        super().__init__(status_code=409, detail="Набор данных изменился. Обновите каталог и повторите расчёт.")
