import {
  PORTFOLIO_SIZE, useRecommendation, useRecommendationExplanations, useWorkspace, type RecommendParams,
} from '@entities/portfolio'

import { explanationFor } from './explanations'

/**
 * Подбор режимов для четырёх выбранных вручную лотов.
 *
 * Запрос уходит сам, как только выбран четвёртый лот: пользователь режимы не
 * назначает, их подбирает сервер (план §14). Числа приходят первым запросом,
 * объяснение — вторым. Изменение состава или условия STRESS меняет ключ
 * запроса — старый ответ не выдаётся за новый.
 */
export function useManualRecommendation(datasetHash: string | undefined) {
  const manualLotIds = useWorkspace((state) => state.manualLotIds)
  const requireStress = useWorkspace((state) => state.requireStress)
  const isComplete = manualLotIds.length === PORTFOLIO_SIZE

  const params: RecommendParams = { datasetHash, requireStress, lotIds: manualLotIds, enabled: isComplete }
  const query = useRecommendation(params)
  const explanations = useRecommendationExplanations({ ...params, enabled: isComplete && query.isSuccess })

  return {
    query,
    explanations,
    explanationFor: (inputHash: string | undefined) => explanationFor(explanations.data, inputHash),
    isComplete,
    lotIds: manualLotIds,
    requireStress,
  }
}
