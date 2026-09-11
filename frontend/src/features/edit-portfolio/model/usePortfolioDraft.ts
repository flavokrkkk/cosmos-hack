import { useCallback, useState } from 'react'

import type { AccessMode, SelectionItem } from '@shared/api/contracts'

export const PORTFOLIO_SIZE = 4

/**
 * Черновик портфеля — ручная копия, с которой работает пользователь.
 *
 * Рекомендация алгоритма в него не мутируется: `replace` создаёт копию, а
 * исходный результат подбора остаётся рядом для сравнения. Переключение
 * сценария BASE/STRESS черновика не трогает — оно меняет только то, какими
 * порогами мы его проверяем.
 */
export function usePortfolioDraft(defaultMode: AccessMode | undefined) {
  const [selection, setSelection] = useState<SelectionItem[]>([])
  const [origin, setOrigin] = useState<'empty' | 'manual' | 'copy'>('empty')

  const toggle = useCallback(
    (lotId: string) => {
      setSelection((current) => {
        const without = current.filter((item) => item.lot_id !== lotId)
        if (without.length !== current.length) return without
        if (current.length >= PORTFOLIO_SIZE) return current
        return [...current, { lot_id: lotId, mode_id: defaultMode?.mode_id ?? 'A' }]
      })
      setOrigin((current) => (current === 'empty' ? 'manual' : current))
    },
    [defaultMode],
  )

  const setMode = useCallback((lotId: string, modeId: string) => {
    setSelection((current) =>
      current.map((item) => (item.lot_id === lotId ? { ...item, mode_id: modeId } : item)),
    )
  }, [])

  /** Взять рекомендацию за основу ручной правки, не изменив её саму. */
  const replace = useCallback((next: SelectionItem[]) => {
    setSelection(next.map((item) => ({ ...item })))
    setOrigin('copy')
  }, [])

  const reset = useCallback(() => {
    setSelection([])
    setOrigin('empty')
  }, [])

  return {
    selection,
    origin,
    isComplete: selection.length === PORTFOLIO_SIZE,
    toggle,
    setMode,
    replace,
    reset,
  }
}
