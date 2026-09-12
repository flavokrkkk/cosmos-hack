import { useCallback } from 'react'

import { MAX_CANDIDATE_LOTS, PORTFOLIO_SIZE, useWorkspace } from '@entities/portfolio'
import type { LotCardState } from '@entities/case'

/**
 * Ручной выбор кандидатов: поиск начинается с четырёх лотов, добавить можно
 * до восьми. Итоговую четвёрку и режимы назначает сервер.
 */
export function useManualSelection() {
  const lotIds = useWorkspace((state) => state.manualLotIds)
  const origin = useWorkspace((state) => state.manualOrigin)
  const toggle = useWorkspace((state) => state.toggleManualLot)
  const remove = useWorkspace((state) => state.removeManualLot)
  const clear = useWorkspace((state) => state.clearManual)

  const isComplete = lotIds.length === 0 || (lotIds.length >= PORTFOLIO_SIZE && lotIds.length <= MAX_CANDIDATE_LOTS)

  const stateOf = useCallback(
    (lotId: string): LotCardState => {
      if (lotIds.includes(lotId)) return 'selected'
      return 'idle'
    },
    [lotIds],
  )

  return {
    lotIds,
    origin,
    count: lotIds.length,
    minimum: PORTFOLIO_SIZE,
    maximum: MAX_CANDIDATE_LOTS,
    remaining: Math.max(0, PORTFOLIO_SIZE - lotIds.length),
    isComplete,
    stateOf,
    toggle,
    remove,
    clear,
  }
}
