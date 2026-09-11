import { PORTFOLIO_SIZE, useRecommendation, useWorkspace } from '@entities/portfolio'

/**
 * Подбор режимов для четырёх выбранных вручную лотов.
 *
 * Запрос уходит сам, как только выбран четвёртый лот: пользователь режимы не
 * назначает, их подбирает сервер (план §14). Изменение состава или условия
 * STRESS меняет ключ запроса — старый ответ не выдаётся за новый.
 */
export function useManualRecommendation(datasetHash: string | undefined) {
  const manualLotIds = useWorkspace((state) => state.manualLotIds)
  const requireStress = useWorkspace((state) => state.requireStress)
  const isComplete = manualLotIds.length === PORTFOLIO_SIZE

  const query = useRecommendation({
    datasetHash,
    requireStress,
    lotIds: manualLotIds,
    enabled: isComplete,
  })

  return { query, isComplete, lotIds: manualLotIds, requireStress }
}
