import { useCallback } from 'react'

import { useRecommendation, useWorkspace } from '@entities/portfolio'

/**
 * Автоподбор по всем восьми лотам.
 *
 * Условие поиска — состояние страницы, а не скрытый параметр запроса: если
 * подбор шёл в BASE, а тумблер уже переключён на STRESS, результат помечается
 * как полученный при других условиях, пока пользователь не нажмёт «Подобрать заново».
 */
export function useAutoRecommendation(datasetHash: string | undefined) {
  const autoSearch = useWorkspace((state) => state.autoSearch)
  const requireStress = useWorkspace((state) => state.requireStress)
  const launchAutoSearch = useWorkspace((state) => state.launchAutoSearch)

  const searchRequireStress = autoSearch?.requireStress ?? requireStress
  const query = useRecommendation({
    datasetHash,
    requireStress: searchRequireStress,
    lotIds: null,
    enabled: autoSearch !== null,
  })

  const conditionChanged = autoSearch !== null && autoSearch.requireStress !== requireStress

  const launch = useCallback(() => {
    if (autoSearch && autoSearch.requireStress === requireStress) {
      void query.refetch()
      return
    }
    launchAutoSearch()
  }, [autoSearch, requireStress, launchAutoSearch, query])

  return {
    query,
    launched: autoSearch !== null,
    conditionChanged,
    searchRequireStress,
    launch,
  }
}
