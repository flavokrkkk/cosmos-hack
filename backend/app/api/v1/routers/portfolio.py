from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.v1.dependencies import get_ollama_service
from app.core.dto.portfolio import (
    Calculation, CaseCatalog, CompareRequest, ComparisonResult, EvaluateRequest,
    PortfolioExplanationRequest, PortfolioExplanationResult, RecommendRequest,
    RecommendationResult,
)
from app.core.services.ollama_service import OllamaService
from app.core.services.portfolio_explanation_service import PortfolioExplanationService
from app.core.services.portfolio_service import PortfolioService
from app.core.services.recommendation_service import RecommendationService


router = APIRouter(prefix="/portfolio", tags=["portfolio"])
Portfolio = Annotated[PortfolioService, Depends(PortfolioService)]
Recommendation = Annotated[RecommendationService, Depends(RecommendationService)]
Ollama = Annotated[
    OllamaService,
    Depends(get_ollama_service),
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


@router.post("/explain", response_model=PortfolioExplanationResult)
async def explain(
    request: PortfolioExplanationRequest,
    ollama: Ollama,
) -> PortfolioExplanationResult:
    return await PortfolioExplanationService().explain(request, ollama)
