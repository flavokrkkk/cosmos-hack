import {
  MAX_CANDIDATE_LOTS, PORTFOLIO_SIZE, useRecommendation, useRecommendationExplanations, useWorkspace, type RecommendParams,
} from '@entities/portfolio'

import { explanationFor } from './explanations'

/**
 * Подбор по всем лотам или по четырём–восьми выбранным вручную кандидатам.
 *
 * Пустой набор не ограничивает поиск. Для выбранных кандидатов запрос уходит
 * начиная с четырёх лотов; сервер подбирает четвёрку среди разрешённых режимов.
 * Числа приходят первым запросом,
 * объяснение — вторым. Изменение состава или условия STRESS меняет ключ
 * запроса — старый ответ не выдаётся за новый.
 */
export function useManualRecommendation(datasetHash: string | undefined) {
  const manualLotIds = useWorkspace((state) => state.manualLotIds)
  const requireStress = useWorkspace((state) => state.requireStress)
  const calculationInputs = useWorkspace((state) => state.calculationInputs)
  const allowedModesByLot = useWorkspace((state) => state.manualAllowedModes)
  const isComplete = manualLotIds.length === 0 || (manualLotIds.length >= PORTFOLIO_SIZE && manualLotIds.length <= MAX_CANDIDATE_LOTS)

  const params: RecommendParams = {
    datasetHash, requireStress, calculationInputs, lotIds: manualLotIds.length ? manualLotIds : null,
    allowedModesByLot, enabled: isComplete,
  }
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
