from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.dto.portfolio import (
    Calculation, CaseCatalog, CompareRequest, ComparisonResult, EvaluateRequest,
    ExplanationJob, ExplanationJobCreated, PortfolioExplanationRequest,
    RecommendRequest, RecommendationResult,
)
from app.api.v1.dependencies import get_portfolio_explanation_service
from app.core.services.portfolio_explanation_service import PortfolioExplanationService
from app.core.services.portfolio_service import PortfolioService
from app.core.services.recommendation_service import RecommendationService


router = APIRouter(prefix="/portfolio", tags=["portfolio"])
Portfolio = Annotated[PortfolioService, Depends(PortfolioService)]
Recommendation = Annotated[RecommendationService, Depends(RecommendationService)]
Explanation = Annotated[
    PortfolioExplanationService,
    Depends(get_portfolio_explanation_service),
]


@router.get("/catalog", response_model=CaseCatalog)
def catalog(service: Portfolio) -> CaseCatalog:
    return service.catalog()


@router.post("/evaluate", response_model=Calculation)
def evaluate(request: EvaluateRequest, service: Portfolio) -> Calculation:
    return service.evaluate(request)


@router.post("/recommend", response_model=RecommendationResult)
def recommend(request: RecommendRequest, service: Recommendation) -> RecommendationResult:
    return service.recommend(request)


@router.post("/compare", response_model=ComparisonResult)
def compare(request: CompareRequest, service: Portfolio) -> ComparisonResult:
    return service.compare(request)


@router.post("/explanations", response_model=ExplanationJobCreated, status_code=202)
async def create_explanation(
    request: PortfolioExplanationRequest,
    service: Explanation,
) -> ExplanationJobCreated:
    return await service.create(request)


@router.get("/explanations/{job_id}", response_model=ExplanationJob)
async def get_explanation(job_id: UUID, service: Explanation) -> ExplanationJob:
    return await service.get(job_id)
