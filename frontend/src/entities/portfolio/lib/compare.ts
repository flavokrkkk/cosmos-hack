import type { Calculation, ComparisonResult, PortfolioMetrics, Scenario } from '@shared/api/contracts'

import { formatNumber } from './format'

/**
 * Показатели, по которым бэкенд считает дельты (`ComparisonResult.deltas`).
 *
 * Порядок и состав повторяют кортеж `fields` в
 * `backend/app/core/services/portfolio_service.py:compare`. Если бэкенд добавит
 * показатель, здесь появится строка — а не молча пропадёт колонка.
 */
export type DeltaKey =
  | 'c0_mrub'
  | 'opex_mrub_per_year'
  | 'vpub_mrub_per_year'
  | 'cash_mrub_per_year'
  | 'kcash'
  | 't_rep'

type DeltaRow = {
  key: DeltaKey
  title: string
  unit: string
  /**
   * Куда «лучше» по этому показателю. Направления взяты из приоритетов метода
   * `pareto_lexicographic_v1` и из смысла ограничений: пороги по `c0` и `opex`
   * — сверху (<=), по `vpub`, `kcash`, `t_rep` — снизу (>=).
   */
  better: 'less' | 'more'
}

/**
 * Каждый показатель сравнивается ОТДЕЛЬНО.
 *
 * Суммарного «балла варианта» здесь нет и быть не может: это потребовало бы
 * весов, нормализации и обоснования их происхождения. Команда весов не вводит —
 * метод выбора Парето-лексикографический. Тем более нельзя складывать
 * `vpub_mrub_per_year` с `cash_mrub_per_year`: разные контуры, двойной счёт.
 */
export const DELTA_ROWS: readonly DeltaRow[] = [
  { key: 'vpub_mrub_per_year', title: 'Общественная ценность', unit: 'млн ₽/год', better: 'more' },
  { key: 'c0_mrub', title: 'Стартовые затраты', unit: 'млн ₽', better: 'less' },
  { key: 'opex_mrub_per_year', title: 'Годовые расходы', unit: 'млн ₽/год', better: 'less' },
  { key: 'cash_mrub_per_year', title: 'Денежные поступления', unit: 'млн ₽/год', better: 'more' },
  { key: 'kcash', title: 'Покрытие расходов', unit: '', better: 'more' },
  { key: 't_rep', title: 'Средняя тиражируемость', unit: '', better: 'more' },
]

/** Дельта меньше этого по модулю считается совпадением: артефакт float. */
const EPSILON = 1e-9

export type DeltaVerdict = 'same' | 'gain' | 'cost'

/** «Что выигрываем» / «чем платим» — относительно базы сравнения. */
export function deltaVerdict(value: number, better: DeltaRow['better']): DeltaVerdict {
  if (Math.abs(value) < EPSILON) return 'same'
  const improves = better === 'more' ? value > 0 : value < 0
  return improves ? 'gain' : 'cost'
}

export const DELTA_VERDICT_LABEL: Record<DeltaVerdict, string> = {
  same: 'как у базы',
  gain: 'выигрыш',
  cost: 'плата',
}

/** Дельта со знаком. Ноль печатается без знака, чтобы не читался как «+0». */
export function formatDelta(value: number): string {
  if (Math.abs(value) < EPSILON) return '0'
  return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value))}`
}

export type ScenarioVerdict = {
  scenario: Scenario
  passed: number
  total: number
  feasible: boolean
  /** Коды нарушенных условий — эксперт видит, что именно не сошлось. */
  failedCodes: string[]
}

/**
 * Итог по сценарию для ОДНОГО состава портфеля.
 *
 * BASE и STRESS приходят в одном ответе на один и тот же состав: сценарий
 * меняет только пороги, а не выбор лотов и не режимы доступа.
 */
export function scenarioVerdict(calculation: Calculation, scenario: Scenario): ScenarioVerdict {
  const checks = calculation.checks[scenario] ?? []
  const failed = checks.filter((check) => !check.passed)
  return {
    scenario,
    passed: checks.length - failed.length,
    total: checks.length,
    feasible: calculation.feasible_by_scenario[scenario],
    failedCodes: failed.map((check) => check.code),
  }
}

/** Показатель варианта по ключу дельты. `null` — портфель неполный. */
export function metricValue(
  metrics: PortfolioMetrics | null,
  key: DeltaKey,
): number | null {
  return metrics ? metrics[key] : null
}

/** Дельты варианта по индексу; пустой объект, если бэкенд их не прислал. */
export function deltasAt(result: ComparisonResult, index: number): Record<string, number> {
  return result.deltas[index] ?? {}
}
