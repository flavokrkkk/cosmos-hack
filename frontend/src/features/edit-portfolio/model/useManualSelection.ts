import { useCallback } from 'react'

import { PORTFOLIO_SIZE, useWorkspace } from '@entities/portfolio'
import type { LotCardState } from '@entities/case'

/**
 * Ручной выбор лотов: 0–4 уникальных, режимы не назначаются — их подбирает сервер.
 * Пятый лот не добавляется: чтобы взять новый, нужно убрать один из четырёх.
 */
export function useManualSelection() {
  const lotIds = useWorkspace((state) => state.manualLotIds)
  const origin = useWorkspace((state) => state.manualOrigin)
  const toggle = useWorkspace((state) => state.toggleManualLot)
  const remove = useWorkspace((state) => state.removeManualLot)
  const clear = useWorkspace((state) => state.clearManual)

  const isComplete = lotIds.length === PORTFOLIO_SIZE

  const stateOf = useCallback(
    (lotId: string): LotCardState => {
      if (lotIds.includes(lotId)) return 'selected'
      return isComplete ? 'dimmed' : 'idle'
    },
    [lotIds, isComplete],
  )

  return {
    lotIds,
    origin,
    count: lotIds.length,
    size: PORTFOLIO_SIZE,
    remaining: PORTFOLIO_SIZE - lotIds.length,
    isComplete,
    stateOf,
    toggle,
    remove,
    clear,
  }
}
