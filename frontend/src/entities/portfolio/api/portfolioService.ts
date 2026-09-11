import { apiClient } from '@shared/api'
import type {
  Calculation, CompareRequest, ComparisonResult, EvaluateRequest, PortfolioExplanationRequest,
  PortfolioExplanationResult, RecommendRequest, RecommendationResult,
} from '@shared/api/contracts'

export const portfolioService = {
  /** Расчёт заданного портфеля: показатели и девять проверок в обоих сценариях. */
  evaluate: (request: EvaluateRequest) =>
    apiClient.post<Calculation>('/portfolio/evaluate', request),

  /** Перебор пространства (полный или внутри четырёх лотов): портфель команды и опорные точки фронта. */
  recommend: (request: RecommendRequest) =>
    apiClient.post<RecommendationResult>('/portfolio/recommend', request),

  /** Сопоставление нескольких вариантов по одним показателям. */
  compare: (request: CompareRequest) =>
    apiClient.post<ComparisonResult>('/portfolio/compare', request),

  /**
   * Объяснение полного портфеля одним запросом. Генерация может занимать
   * десятки секунд: бэкенд ждёт Ollama до своего таймаута и при сбое отдаёт шаблон.
   */
  explain: (request: PortfolioExplanationRequest) =>
    apiClient.post<PortfolioExplanationResult>('/portfolio/explain', request, { timeout: 240_000 }),
}
