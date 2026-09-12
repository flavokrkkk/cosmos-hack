from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class OllamaMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str


class OllamaChatResult(BaseModel):
    model: str
    content: str
    done_reason: str | None = None
    total_duration: int | None = None
    prompt_eval_count: int | None = None
    eval_count: int | None = None


class PortfolioExplanationPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=300)
    fact_ids: list[str] = Field(min_length=1, max_length=3)


class PortfolioExplanationDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    headline: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=500)
    strengths: list[PortfolioExplanationPoint] = Field(min_length=1, max_length=3)
    limitations: list[PortfolioExplanationPoint] = Field(min_length=1, max_length=3)


class BatchExplanationItem(PortfolioExplanationDraft):
    model_config = ConfigDict(extra="forbid")
    key: str
    summary: str = Field(min_length=1, max_length=300)
    strengths: list[PortfolioExplanationPoint] = Field(min_length=1, max_length=1)
    limitations: list[PortfolioExplanationPoint] = Field(min_length=1, max_length=1)


class BatchExplanationDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[BatchExplanationItem] = Field(min_length=1, max_length=5)


class ComparisonExplanationPoint(PortfolioExplanationPoint):
    text: str = Field(min_length=1, max_length=140)


class ComparisonExplanationDraft(PortfolioExplanationDraft):
    headline: Literal["Компромиссы выбранных портфелей"] = "Компромиссы выбранных портфелей"
    summary: str = Field(min_length=1, max_length=220)
    strengths: list[ComparisonExplanationPoint] = Field(min_length=1, max_length=2)
    limitations: list[ComparisonExplanationPoint] = Field(min_length=1, max_length=2)


class EvidenceSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    narrative: str = Field(min_length=80, max_length=650)
    summary_ids: list[str] = Field(min_length=2, max_length=2)
    strength_ids: list[str] = Field(max_length=2)
    limitation_ids: list[str] = Field(max_length=2)


class EvidenceBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[EvidenceSelection] = Field(min_length=1, max_length=5)
