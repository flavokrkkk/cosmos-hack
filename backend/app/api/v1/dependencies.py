from fastapi import Request

from app.core.services.ollama_service import OllamaService
from app.core.services.comparison_analysis_service import ComparisonAnalysisService
from app.core.services.recommendation_summary_service import RecommendationSummaryService


async def get_ollama_service(request: Request) -> OllamaService:
    return request.app.state.ollama_service


async def get_recommendation_summary_service(request: Request) -> RecommendationSummaryService:
    return request.app.state.recommendation_summary_service


async def get_comparison_analysis_service(request: Request) -> ComparisonAnalysisService:
    return request.app.state.comparison_analysis_service
