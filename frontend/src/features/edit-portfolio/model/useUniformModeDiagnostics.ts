import { useQueries } from '@tanstack/react-query'

import { PORTFOLIO_SIZE, evaluateQueryOptions } from '@entities/portfolio'
import type { AccessMode, Calculation, CalculationInputs, Scenario } from '@shared/api/contracts'

export type UniformModeDiagnostic = {
  mode: AccessMode
  calculation: Calculation | undefined
  isPending: boolean
}

/**
 * Диагностика, когда сервер не нашёл ни одного сочетания режимов: тот же
 * состав считается с ОДНИМ режимом у всех лотов — по разу на каждый режим.
 * Это ориентир, а не подбор: пользователь видит, что мешает при A, B и C,
 * а «не проходит при любом одинаковом режиме» — пересечение нарушений.
 */
export function useUniformModeDiagnostics(
  datasetHash: string | undefined,
  lotIds: readonly string[],
  modes: readonly AccessMode[],
  enabled: boolean,
  inputs: CalculationInputs | null = null,
) {
  const results = useQueries({
    queries: enabled && Boolean(datasetHash) && lotIds.length === PORTFOLIO_SIZE ? modes.map((mode) => ({
      ...evaluateQueryOptions(datasetHash, lotIds.map((lotId) => ({ lot_id: lotId, mode_id: mode.mode_id })), inputs),
    })) : [],
  })

  const diagnostics: UniformModeDiagnostic[] = modes.map((mode, index) => ({
    mode,
    calculation: results[index]?.data,
    isPending: results[index]?.isPending ?? true,
  }))

  /** Коды условий, нарушенных при каждом одинаковом режиме, — настоящие блокеры набора. */
  function alwaysFailing(scenario: Scenario): string[] {
    const ready = diagnostics.filter((item) => item.calculation)
    if (ready.length === 0) return []
    const failedSets = ready.map(
      (item) => new Set((item.calculation?.checks[scenario] ?? []).filter((c) => !c.passed).map((c) => c.code)),
    )
    return [...failedSets[0]].filter((code) => failedSets.every((set) => set.has(code)))
  }

  return { diagnostics, alwaysFailing }
}
