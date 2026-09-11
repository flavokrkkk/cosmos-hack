import { useCallback } from 'react'

import { useExplanation as useExplanationQuery, useWorkspace } from '@entities/portfolio'
import { normalizeApiError } from '@shared/api'
import type { Calculation, Scenario } from '@shared/api/contracts'

export type ExplanationStatus =
  /** Полного портфеля нет — объяснять нечего. */
  | 'unavailable'
  /** Можно запросить. */
  | 'idle'
  | 'loading'
  | 'succeeded'
  | 'error'

/**
 * Объяснение расчёта: один HTTP-запрос по действию пользователя.
 *
 * Факт запроса хранится в сессии, результат — в кеше запросов (тоже в сессии),
 * поэтому после перезагрузки текст на месте, а повторный клик по той же паре
 * «состав + сценарий» не ходит на сервер. Модель ничего не считает: тезисы
 * ссылаются на факты расчёта, числа подставляет сервер.
 */
export function useExplanation(
  datasetHash: string | undefined,
  calculation: Calculation | undefined,
  scenario: Scenario,
) {
  const complete = calculation?.status === 'complete' && calculation.metrics !== null
  const key = complete ? `${calculation.input_hash}:${scenario}` : undefined

  const requested = useWorkspace((state) => (key ? Boolean(state.explanationRequests[key]) : false))
  const requestExplanation = useWorkspace((state) => state.requestExplanation)
  const forgetExplanation = useWorkspace((state) => state.forgetExplanation)

  const query = useExplanationQuery(datasetHash, calculation?.selection ?? [], scenario, requested && complete)

  const request = useCallback(() => {
    if (!key) return
    if (requested) {
      void query.refetch()
      return
    }
    requestExplanation(key)
  }, [key, requested, requestExplanation, query])

  const reset = useCallback(() => {
    if (key) forgetExplanation(key)
  }, [key, forgetExplanation])

  const status: ExplanationStatus = !complete
    ? 'unavailable'
    : !requested
      ? 'idle'
      : query.isPending || query.isFetching
        ? 'loading'
        : query.isError
          ? 'error'
          : 'succeeded'

  return {
    status,
    result: query.data,
    errorMessage: query.isError ? normalizeApiError(query.error).message : undefined,
    request,
    reset,
  }
}
