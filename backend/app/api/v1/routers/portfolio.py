from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.v1.dependencies import get_ollama_service, get_recommendation_summary_service, get_comparison_analysis_service
from app.core.dto.portfolio import (
    Calculation, CaseCatalog, CompareRequest, ComparisonResult, EvaluateRequest,
    PortfolioExplanationRequest, PortfolioExplanationResult, RecommendRequest,
    RecommendationResult,
    ComparisonAnalysisRequest, ComparisonAnalysisResult,
)
from app.core.services.ollama_service import OllamaService
from app.core.services.comparison_analysis_service import ComparisonAnalysisService
from app.core.services.portfolio_explanation_service import PortfolioExplanationService
from app.core.services.portfolio_service import PortfolioService
from app.core.services.recommendation_summary_service import RecommendationSummaryService


router = APIRouter(prefix="/portfolio", tags=["portfolio"])
Portfolio = Annotated[PortfolioService, Depends(PortfolioService)]
Recommendation = Annotated[RecommendationSummaryService, Depends(get_recommendation_summary_service)]
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
async def recommend(request: RecommendRequest, service: Recommendation, ollama: Ollama) -> RecommendationResult:
    return await service.recommend(request, ollama)


@router.post("/compare", response_model=ComparisonResult)
def compare(request: CompareRequest, service: Portfolio) -> ComparisonResult:
    return service.compare(request)


@router.post("/compare/analyze", response_model=ComparisonAnalysisResult)
async def analyze_comparison(
    request: ComparisonAnalysisRequest,
    service: Annotated[ComparisonAnalysisService, Depends(get_comparison_analysis_service)],
    ollama: Ollama,
) -> ComparisonAnalysisResult:
    return await service.analyze(request, ollama)


@router.post("/explain", response_model=PortfolioExplanationResult)
async def explain(
    request: PortfolioExplanationRequest,
    ollama: Ollama,
) -> PortfolioExplanationResult:
    return await PortfolioExplanationService().explain(request, ollama)
