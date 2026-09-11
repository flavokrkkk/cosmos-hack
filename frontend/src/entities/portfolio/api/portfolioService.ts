import { apiClient } from '@shared/api'
import type {
  Calculation, CompareRequest, ComparisonResult, EvaluateRequest,
  RecommendRequest, RecommendationResult,
} from '@shared/api/contracts'

export const portfolioService = {
  /** Расчёт заданного портфеля: показатели и девять проверок в обоих сценариях. */
  evaluate: (request: EvaluateRequest) =>
    apiClient.post<Calculation>('/portfolio/evaluate', request),

  /** Перебор всего пространства и рекомендация с альтернативами. */
  recommend: (request: RecommendRequest) =>
    apiClient.post<RecommendationResult>('/portfolio/recommend', request),

  /** Сопоставление нескольких вариантов по одним показателям. */
  compare: (request: CompareRequest) =>
    apiClient.post<ComparisonResult>('/portfolio/compare', request),
}
