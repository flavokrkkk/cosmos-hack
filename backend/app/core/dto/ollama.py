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
