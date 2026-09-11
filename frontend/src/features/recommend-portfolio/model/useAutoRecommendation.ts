import { useCallback } from 'react'

import { useRecommendation, useWorkspace } from '@entities/portfolio'

/**
 * Автоподбор по всем восьми лотам.
 *
 * После первого запуска изменение условия сразу переключает запрос.
 */
export function useAutoRecommendation(datasetHash: string | undefined) {
  const autoSearch = useWorkspace((state) => state.autoSearch)
  const requireStress = useWorkspace((state) => state.requireStress)
  const launchAutoSearch = useWorkspace((state) => state.launchAutoSearch)

  const query = useRecommendation({
    datasetHash,
    requireStress,
    lotIds: null,
    enabled: autoSearch !== null,
  })

  const launch = useCallback(() => {
    if (autoSearch) {
      void query.refetch()
      return
    }
    launchAutoSearch()
  }, [autoSearch, launchAutoSearch, query])

  return {
    query,
    launched: autoSearch !== null,
    searchRequireStress: requireStress,
    launch,
  }
}
