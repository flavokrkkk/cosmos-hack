import { useCallback, useEffect } from 'react'

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
 * Объяснение автоматически загружается для открытого расчёта и сценария.
 * Задержка не запускает генерацию для каждого быстро пролистанного варианта.
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

  useEffect(() => {
    if (!key || requested) return
    const timer = window.setTimeout(() => requestExplanation(key), 400)
    return () => window.clearTimeout(timer)
  }, [key, requested, requestExplanation])

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
