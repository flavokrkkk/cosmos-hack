import { useCallback } from 'react'

import {
  useRecommendation, useRecommendationExplanations, useWorkspace, type RecommendParams,
} from '@entities/portfolio'

import { explanationFor } from './explanations'

/**
 * Автоподбор по всем восьми лотам в два шага: числа — сразу, пакетное
 * объяснение — вторым запросом. Изменение условия STRESS после первого
 * запуска сразу переключает запрос (стор обновляет `autoSearch`).
 */
export function useAutoRecommendation(datasetHash: string | undefined) {
  const autoSearch = useWorkspace((state) => state.autoSearch)
  const requireStress = useWorkspace((state) => state.requireStress)
  const launchAutoSearch = useWorkspace((state) => state.launchAutoSearch)

  const params: RecommendParams = { datasetHash, requireStress, lotIds: null, enabled: autoSearch !== null }
  const query = useRecommendation(params)
  const explanations = useRecommendationExplanations({ ...params, enabled: params.enabled && query.isSuccess })

  const launch = useCallback(() => {
    if (autoSearch) {
      void query.refetch()
      void explanations.refetch()
      return
    }
    launchAutoSearch()
  }, [autoSearch, launchAutoSearch, query, explanations])

  return {
    query,
    explanations,
    explanationFor: (inputHash: string | undefined) => explanationFor(explanations.data, inputHash),
    launched: autoSearch !== null,
    searchRequireStress: requireStress,
    launch,
  }
}
