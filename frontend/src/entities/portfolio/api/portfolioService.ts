import { apiClient } from '@shared/api'
import type {
  Calculation, CompareRequest, ComparisonResult, EvaluateRequest, PortfolioExplanationRequest,
  PortfolioExplanationResult, RecommendRequest, RecommendationResult,
} from '@shared/api/contracts'

let explanationQueue: Promise<void> = Promise.resolve()

function explain(request: PortfolioExplanationRequest, signal?: AbortSignal) {
  // Одна генерация на вкладку; отменённые варианты пропускаем до отправки.
  const response = explanationQueue.then(() => {
    signal?.throwIfAborted()
    return apiClient.post<PortfolioExplanationResult>('/portfolio/explain', request, {
      timeout: 240_000,
      signal,
    })
  })
  explanationQueue = response.then(() => undefined, () => undefined)
  return response
}

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
  explain,
}
