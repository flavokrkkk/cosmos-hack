from typing import Any

from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database.models.base import Base


class PortfolioExplanationJob(Base):
    __tablename__ = "portfolio_explanation_jobs"

    status: Mapped[str] = mapped_column(String(16), index=True)
    request: Mapped[dict[str, Any]] = mapped_column(JSON)
    calculation_input_hash: Mapped[str] = mapped_column(String(64), index=True)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
