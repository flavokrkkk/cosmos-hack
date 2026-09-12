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
  const calculationInputs = useWorkspace((state) => state.calculationInputs)
  const launchAutoSearch = useWorkspace((state) => state.launchAutoSearch)

  const params: RecommendParams = {
    datasetHash, requireStress, calculationInputs, lotIds: null, enabled: autoSearch !== null,
  }
  const query = useRecommendation(params)
  const explanations = useRecommendationExplanations({ ...params, enabled: params.enabled && query.isSuccess })

  const launch = useCallback(() => {
    // Каждый явный запуск открывает именно результат автоподбора, даже если
    // до этого был выбран сохранённый, ручной или альтернативный вариант.
    launchAutoSearch()
    if (autoSearch) {
      void query.refetch()
      void explanations.refetch()
    }
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
