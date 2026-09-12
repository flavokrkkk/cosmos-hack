import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { recommendationQueryOptions, useWorkspace } from '@entities/portfolio'

/**
 * Предзагрузка первого шага автоподбора для текущего условия STRESS: расчёт
 * детерминирован и дёшев для бэкенда (кеш прогрет при старте), поэтому к
 * моменту клика «Подобрать портфель» ответ уже в кеше и карточки появляются
 * мгновенно. Объяснения не предзагружаются — они дорогие.
 */
export function usePrefetchRecommendation(datasetHash: string | undefined) {
  const queryClient = useQueryClient()
  const requireStress = useWorkspace((state) => state.requireStress)
  const calculationInputs = useWorkspace((state) => state.calculationInputs)

  useEffect(() => {
    if (!datasetHash) return
    void queryClient.prefetchQuery(
      recommendationQueryOptions({ datasetHash, requireStress, calculationInputs, lotIds: null, enabled: true }),
    )
  }, [queryClient, datasetHash, requireStress, calculationInputs])
}
