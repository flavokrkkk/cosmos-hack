/**
 * Контракт с бэкендом: зеркало `backend/app/core/dto/portfolio.py`.
 *
 * Один файл на один файл — расхождение видно обычным диффом. Своих трактовок
 * здесь нет: имена полей и литералы совпадают с pydantic-моделями буква в букву.
 * Единицы: `*_mrub` — млн ₽ единовременно, `*_mrub_per_year` — млн ₽ в год.
 */

export type Scenario = 'BASE' | 'STRESS'
export type RankingMethod = 'hybrid_maximin_v1'
export type RankingKey = 'vpub' | 'surplus' | 'c0' | 'readiness' | 'resilience' | 'scale'
export type RankingCriterion = { key: RankingKey; title: string; direction: 'max' | 'min' }
export type ScoreComponent = RankingCriterion & {
  raw: number; minimum: number; maximum: number; normalized: number; bottleneck: boolean
}
export type MethodOutcome = {
  method_id: RankingMethod; selection_id: string; selection: SelectionItem[]
  c0_mrub: number; vpub_mrub_per_year: number; annual_surplus_mrub: number; kcash: number
  q: number; q_exact: string; components: ScoreComponent[]
}
type SelectionStages = {
  s_max_mrub: number | null; cash_floor_mrub: number | null; cash_eligible_count: number
  q_max: number | null; effective_delta_mrub: number | null
}
export type SensitivityCase = SelectionStages & {
  id: string; title: string; origin: 'допущение'; feasible_count: number
  budget_cap_mrub: number; vpub_floor_mrub_per_year: number; required_public_lot_ids: string[]
  cash_multiplier: number; opex_multiplier: number
  outcome: {
    winner: MethodOutcome | null; winner_changed: boolean; original_still_feasible: boolean
    original_adjusted_surplus_mrub: number | null
  }
}
export type DecisionAnalysis = SelectionStages & {
  winner: MethodOutcome | null; sensitivity: SensitivityCase[]
  cash_loss_limit_mrub: number | null; quality_epsilon: 0
  reference_count: number; bounds: Record<RankingKey, [number, number]>
  switching_curve: { delta_from_mrub: number; delta_to_exclusive_mrub: number | null; winner: MethodOutcome }[]
  pareto_objectives: string[]; normalization: string; caveat: string
}
export type FinancialSummary = {
  annual_surplus_mrub: number; annual_funding_gap_mrub: number; operating_self_financed: boolean
  anchor_cash_mrub_per_year: number; commercial_cash_mrub_per_year: number
  cash_drop_break_even_pct: number | null; opex_growth_break_even_pct: number | null
  startup_headroom_mrub: Record<Scenario, number>; public_lot_ids: string[]; limitation: string
}

export type ComparisonAnalysisRequest = CompareRequest & { scenario: Scenario }
export type ComparisonAnalysisResult = RecommendationExplanation & { comparison: ComparisonResult }

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

/** Полный снимок входов сценария пользователя. Официальные файлы на диске не меняются. */
export type CalculationInputs = {
  lots: Lot[]
  modes: AccessMode[]
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
  team_decision: {
    team_name: string
    strategy_thesis: string
    management: Record<string, string>
    assumptions: Record<string, string>[]
    algorithm_parameters: Record<string, unknown>
    source: string
  }
  case_id: string
  case_version: string
  /** Версия исходных данных. Показывать эксперту: README §14, сценарий 1. */
  dataset_hash: string
  engine_version: string
  lots: Lot[]
  modes: AccessMode[]
  constraints: Record<Scenario, ConstraintDefinition[]>
  methods: MethodDefinition[]
  ranking_criteria: RankingCriterion[]
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
  inputs: CalculationInputs | null
  dataset_hash: string
  input_hash: string
  engine_version: string
  selection: SelectionItem[]
  /** `incomplete` — выбрано меньше четырёх лотов. */
  status: 'incomplete' | 'complete'
  detail: LotDetail[]
  /**
   * `null` только при ПУСТОМ выборе. При 1–3 лотах движок возвращает
   * промежуточную сумму по выбранным лотам — это не итог портфеля, и выдавать
   * её за итог нельзя (проверено на живом бэкенде 11.09).
   */
  metrics: PortfolioMetrics | null
  /** Пустой объект `{}` при пустом выборе: `checks[scenario]` тогда `undefined`. */
  checks: Partial<Record<Scenario, ConstraintCheck[]>>
  feasible_by_scenario: Record<Scenario, boolean>
  financial: FinancialSummary | null
}

// ────────────────────────────── рекомендация ────────────────────────────────

/**
 * Вариант из ответа подбора. `recommended` — результат hybrid_maximin_v1
 * для текущих условий; `alternatives` — опорные точки фронта: крайние
 * значения по каждому показателю среди недоминируемых.
 */
export type RecommendationVariant = {
  title: string
  reason: string
  calculation: Calculation
  explanation: RecommendationExplanation | null
}

export type RecommendationResult = {
  input_hash: string
  request: RecommendRequest
  /**
   * `no_feasible` — допустимых нет, `recommended` и `alternatives` пусты.
   * Тип допускает `recommended: null`; интерфейс тогда показывает первую
   * опорную точку под её собственным названием.
   */
  status: 'ok' | 'no_feasible'
  considered_count: number
  base_count: number
  stress_count: number
  feasible_count: number
  pareto_count: number
  method: MethodDefinition
  recommended: RecommendationVariant | null
  alternatives: RecommendationVariant[]
  analysis: DecisionAnalysis | null
}

export type ComparisonResult = {
  variants: Calculation[]
  deltas: Record<string, number>[]
  baseline_index: number
}

// ──────────────────────────────── запросы ───────────────────────────────────

export type EvaluateRequest = {
  dataset_hash: string
  inputs?: CalculationInputs | null
  /** До четырёх пар; бэкенд отклоняет дубликаты лотов (422). */
  selection: SelectionItem[]
}

export type RecommendRequest = {
  dataset_hash: string
  inputs?: CalculationInputs | null
  /** Искать только среди проходящих STRESS без пересмотра состава. */
  require_stress: boolean
  method_id: RankingMethod
  cash_loss_limit_mrub?: number | null
  quality_epsilon?: 0
  budget_cap_mrub?: number | null
  vpub_floor_mrub_per_year?: number | null
  required_public_lot_ids?: string[]
  /**
   * От четырёх до восьми лотов-кандидатов. Алгоритм перебирает все четвёрки
   * и режимы внутри этого списка; `null` — полный автоподбор по всем восьми.
   * Бэкенд сортирует список и отклоняет дубликаты и неизвестные ID (422).
   */
  lot_ids?: string[] | null
  allowed_modes_by_lot?: Record<string, string[]>
  /**
   * `false` — только расчёт и фронт, без пакетного объяснения Ollama (доли секунды).
   * Фронтенд сначала показывает числа, а объяснения запрашивает вторым вызовом.
   * На `input_hash` флаг не влияет.
   */
  with_explanations?: boolean
}

export type CompareRequest = {
  variants: EvaluateRequest[]
}

// ───────────────────── объяснение расчёта (опционально) ─────────────────────

/**
 * Пояснение к уже посчитанному портфелю. Модель ничего не считает и не
 * выбирает: она излагает факты расчёта. Каждый тезис ссылается на `fact_id`,
 * числа подставляет сервер — свободный текст модели их не содержит.
 * Один обычный HTTP-запрос: очереди, `job_id` и опроса нет (решение 12.09).
 */

export type PortfolioExplanationRequest = {
  dataset_hash: string
  inputs?: CalculationInputs | null
  /** Ровно четыре пары: пояснение даётся только полному портфелю. */
  selection: SelectionItem[]
  scenario: Scenario
}

export type ExplanationFact = {
  id: string
  text: string
  source: 'calculation' | 'system'
  kind?: 'strength' | 'limitation' | 'context'
}

export type ExplanationPoint = {
  text: string
  fact_ids: string[]
}

export type PortfolioExplanation = {
  headline: string
  summary: string
  strengths: ExplanationPoint[]
  limitations: ExplanationPoint[]
}

export type PortfolioExplanationResult = {
  calculation: Calculation
  scenario: Scenario
  facts: ExplanationFact[]
  explanation: PortfolioExplanation
  model: string | null
  /** `template` — модель выключена или недоступна, текст собран сервером по фактам расчёта. */
  generated_by: 'ollama' | 'template'
  warning?: string | null
  unavailable_reason?: 'disabled' | 'generation_failed' | null
}

export type RecommendationExplanation = Omit<PortfolioExplanationResult, 'calculation'> & {
  composition: 'generative' | 'extractive'
  input_hash: string
}
