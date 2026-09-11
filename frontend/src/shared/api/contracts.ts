/**
 * Контракт с бэкендом: зеркало `backend/app/core/dto/portfolio.py`.
 *
 * Один файл на один файл — расхождение видно обычным диффом. Своих трактовок
 * здесь нет: имена полей и литералы совпадают с pydantic-моделями буква в букву.
 * Единицы: `*_mrub` — млн ₽ единовременно, `*_mrub_per_year` — млн ₽ в год.
 */

export type Scenario = 'BASE' | 'STRESS'

export const SCENARIOS: readonly Scenario[] = ['BASE', 'STRESS']

/** Ровно четыре такие пары образуют портфель. */
export type SelectionItem = {
  lot_id: string
  mode_id: string
}

// ─────────────────────────────── каталог ────────────────────────────────────

export type Lot = {
  lot_id: string
  title: string
  service: string
  territorial_archetype: string
  territory_title: string
  capability_groups: string[]
  federal: boolean
  c0_mrub: number
  opex_mrub_per_year: number
  anchor_cash_mrub_per_year: number
  commercial_cash_mrub_per_year: number
  vpub_mrub_per_year: number
  t_rep: number
  readiness_1_5: number
  resilience_1_5: number
  scale_1_5: number
}

export type AccessMode = {
  mode_id: string
  k_c0: number
  k_opex: number
  k_vpub: number
  k_anchor: number
  k_commercial: number
  /** Флаг общественного ядра. В каноническом наборе есть только у режима A. */
  public_core: boolean
}

export type ConstraintDefinition = {
  code: string
  title: string
  operator: '==' | '<=' | '>='
  threshold: number
  unit: string
}

export type MethodDefinition = {
  id: string
  title: string
  priorities: string[]
  description: string
  /** Метод выбора — допущение команды, а не требование кейса. */
  origin: 'допущение'
}

export type CaseCatalog = {
  case_id: string
  case_version: string
  /** Версия исходных данных. Показывать эксперту: README §14, сценарий 1. */
  dataset_hash: string
  engine_version: string
  lots: Lot[]
  modes: AccessMode[]
  constraints: Record<Scenario, ConstraintDefinition[]>
  methods: MethodDefinition[]
  source_refs: string[]
  origin: 'постановка'
}

// ──────────────────────────────── расчёт ────────────────────────────────────

/** `slack` приходит `null`, когда запас не определён (например, у `== 4`). */
export type ConstraintCheck = ConstraintDefinition & {
  actual: number
  slack: number | null
  passed: boolean
}

export type PortfolioMetrics = {
  selected_lots: number
  c0_mrub: number
  opex_mrub_per_year: number
  vpub_mrub_per_year: number
  cash_mrub_per_year: number
  /** cash / opex. Не прибыль, не ROI, не срок окупаемости. */
  kcash: number
  t_rep: number
  readiness_1_5: number
  resilience_1_5: number
  scale_1_5: number
  territorial_archetypes: number
  capability_groups: number
  capability_set: string[]
  public_core_lots: number
}

export type LotDetail = {
  lot_id: string
  mode_id: string
  c0_mrub: number
  opex_mrub_per_year: number
  vpub_mrub_per_year: number
  cash_mrub_per_year: number
  t_rep: number
  readiness_1_5: number
  resilience_1_5: number
  scale_1_5: number
  territorial_archetype: string
  federal: boolean
  capability_groups: string
  public_core: boolean
}

export type Calculation = {
  dataset_hash: string
  input_hash: string
  engine_version: string
  selection: SelectionItem[]
  /** `incomplete` — выбрано меньше четырёх лотов; `metrics` тогда `null`. */
  status: 'incomplete' | 'complete'
  detail: LotDetail[]
  metrics: PortfolioMetrics | null
  checks: Record<Scenario, ConstraintCheck[]>
  feasible_by_scenario: Record<Scenario, boolean>
}

// ────────────────────────────── рекомендация ────────────────────────────────

export type RecommendationVariant = {
  title: string
  reason: string
  calculation: Calculation
}

export type RecommendationResult = {
  input_hash: string
  request: RecommendRequest
  /** `no_feasible` — допустимых нет; `recommended` тогда `null`. */
  status: 'ok' | 'no_feasible'
  considered_count: number
  base_count: number
  stress_count: number
  feasible_count: number
  pareto_count: number
  method: MethodDefinition
  recommended: RecommendationVariant | null
  alternatives: RecommendationVariant[]
}

export type ComparisonResult = {
  variants: Calculation[]
  deltas: Record<string, number>[]
  baseline_index: number
}

// ──────────────────────────────── запросы ───────────────────────────────────

export type EvaluateRequest = {
  dataset_hash: string
  /** До четырёх пар; бэкенд отклоняет дубликаты лотов (422). */
  selection: SelectionItem[]
}

export type RecommendRequest = {
  dataset_hash: string
  /** Искать только среди проходящих STRESS без пересмотра состава. */
  require_stress: boolean
  method_id: 'pareto_lexicographic_v1'
}

export type CompareRequest = {
  variants: EvaluateRequest[]
}
