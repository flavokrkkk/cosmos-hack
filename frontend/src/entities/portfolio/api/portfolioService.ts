import { apiClient } from '@shared/api'
import type {
  Calculation, CompareRequest, ComparisonResult, EvaluateRequest,
  RecommendRequest, RecommendationResult,
  ComparisonAnalysisRequest, ComparisonAnalysisResult,
} from '@shared/api/contracts'

export const portfolioService = {
  /** Расчёт заданного портфеля: показатели и девять проверок в обоих сценариях. */
  evaluate: (request: EvaluateRequest) =>
    apiClient.post<Calculation>('/portfolio/evaluate', request),

  /** Перебор пространства (полный или внутри четырёх лотов): портфель команды и опорные точки фронта. */
  recommend: (request: RecommendRequest, signal?: AbortSignal, timeout = 30_000) =>
    apiClient.post<RecommendationResult>('/portfolio/recommend', request, { timeout, signal }),

  /** Сопоставление нескольких вариантов по одним показателям. */
  compare: (request: CompareRequest) =>
    apiClient.post<ComparisonResult>('/portfolio/compare', request),

  analyzeComparison: (request: ComparisonAnalysisRequest, signal?: AbortSignal) =>
    apiClient.post<ComparisonAnalysisResult>('/portfolio/compare/analyze', request, { timeout: 85_000, signal }),

}
