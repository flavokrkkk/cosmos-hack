from typing import Literal

from pydantic import BaseModel


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
    text: str
    fact_ids: list[str]


class PortfolioExplanationDraft(BaseModel):
    headline: str
    summary: str
    strengths: list[PortfolioExplanationPoint]
    limitations: list[PortfolioExplanationPoint]
