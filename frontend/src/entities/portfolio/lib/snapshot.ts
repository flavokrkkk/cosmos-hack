import type {
  Calculation, CalculationInputs, CaseCatalog, ComparisonResult, MethodOutcome, RecommendationResult,
} from '@shared/api/contracts'
import { SCENARIOS } from '@shared/api/contracts'

/** Четыре файла текущего расчёта. Все показатели берутся из ответа API без округления. */
export type ExportFile = { name: string; mime: string; content: string }

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  return [columns.join(','), ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(','))].join('\n') + '\n'
}

function jsonFile(name: string, value: unknown): ExportFile {
  return { name, mime: 'application/json;charset=utf-8', content: JSON.stringify(value, null, 2) + '\n' }
}

const DETAIL_COLUMNS = [
  'lot_id', 'mode_id', 'c0_mrub', 'opex_mrub_per_year', 'vpub_mrub_per_year',
  'cash_mrub_per_year', 't_rep', 'readiness_1_5', 'resilience_1_5', 'scale_1_5',
  'territorial_archetype', 'federal', 'capability_groups', 'public_core',
] as const

export function detailCsv(calculation: Calculation): ExportFile {
  return { name: 'portfolio_detail.csv', mime: 'text/csv;charset=utf-8', content: csv(DETAIL_COLUMNS, calculation.detail) }
}

export function metricsJson(calculation: Calculation): ExportFile {
  return jsonFile('portfolio_metrics.json', calculation.metrics)
}

function relatedRecommendation(calculation: Calculation, recommendation?: RecommendationResult) {
  return recommendation && [recommendation.recommended, ...recommendation.alternatives]
    .some((variant) => variant?.calculation.input_hash === calculation.input_hash) ? recommendation : undefined
}

/** Параметры именно скачиваемого расчёта; ручной вариант не выдаётся за победителя. */
export function decisionJson(
  calculation: Calculation,
  catalog: CaseCatalog,
  recommendation?: RecommendationResult,
  inputs?: CalculationInputs | null,
): ExportFile {
  const related = relatedRecommendation(calculation, recommendation)
  const isRecommended = related?.recommended?.calculation.input_hash === calculation.input_hash
  return jsonFile('team_decision_config.json', {
    case_id: catalog.case_id,
    case_version: catalog.case_version,
    dataset_hash: calculation.dataset_hash,
    engine_version: calculation.engine_version,
    input_hash: calculation.input_hash,
    inputs: inputs ?? null,
    selection: calculation.selection,
    decision_method: related?.method.id ?? 'manual_evaluation',
    is_recommended: isRecommended,
    recommended: isRecommended ? { selection: calculation.selection } : null,
    search_request: related?.request ?? null,
    source_refs: catalog.source_refs,
    exported_by: 'frontend/dashboard',
  })
}

function shortWinner(winner: MethodOutcome | null) {
  return winner ? { selection_id: winner.selection_id, q: winner.q, annual_surplus_mrub: winner.annual_surplus_mrub } : null
}

export function analysisJson(
  calculation: Calculation,
  comparison?: ComparisonResult,
  recommendation?: RecommendationResult,
): ExportFile {
  const related = relatedRecommendation(calculation, recommendation)
  const isRecommended = related?.recommended?.calculation.input_hash === calculation.input_hash
  const analysis = isRecommended ? related?.analysis : null
  const checks = Object.fromEntries(SCENARIOS.map((scenario) => [
    scenario, (calculation.checks[scenario] ?? []).map(({ passed, ...check }) => ({
      ...check, status: passed ? 'PASS' : 'FAIL',
    })),
  ]))
  return jsonFile('hybrid_analysis.json', {
    format_version: 2,
    method: related?.method.id ?? 'manual_evaluation',
    selection_status: isRecommended ? 'recommended' : related ? 'alternative' : 'manual_evaluation',
    selection: calculation.selection,
    selection_rule: related?.method.description ?? 'Ручная проверка указанного портфеля; оптимальность не утверждается.',
    winner: analysis?.winner ?? null,
    q_max: analysis?.q_max ?? null,
    effective_delta_mrub: analysis?.effective_delta_mrub ?? null,
    s_max_mrub: analysis?.s_max_mrub ?? null,
    cash_floor_mrub: analysis?.cash_floor_mrub ?? null,
    cash_eligible_count: analysis?.cash_eligible_count ?? null,
    cash_loss_limit_mrub: analysis?.cash_loss_limit_mrub ?? null,
    quality_epsilon: analysis?.quality_epsilon ?? null,
    reference_count: analysis?.reference_count ?? null,
    checks,
    financial: calculation.financial,
    search_summary: related ? {
      total_count: related.considered_count, base_count: related.base_count,
      stress_count: related.stress_count, feasible_count: related.feasible_count,
    } : null,
    switching_curve: analysis?.switching_curve.map((point) => ({ ...point, winner: shortWinner(point.winner) })) ?? [],
    sensitivity: analysis?.sensitivity.map((item) => ({
      id: item.id, title: item.title, feasible_count: item.feasible_count, budget_cap_mrub: item.budget_cap_mrub,
      outcome: { winner: shortWinner(item.outcome.winner), winner_changed: item.outcome.winner_changed,
        original_still_feasible: item.outcome.original_still_feasible },
    })) ?? [],
    comparison: comparison ? {
      baseline_index: comparison.baseline_index,
      variants: comparison.variants.map((variant) => ({
        selection: variant.selection, metrics: variant.metrics, feasible_by_scenario: variant.feasible_by_scenario,
      })),
      deltas: comparison.deltas,
    } : null,
    caveat: analysis?.caveat ?? calculation.financial?.limitation,
  })
}

export function snapshotFiles(
  calculation: Calculation,
  catalog: CaseCatalog,
  comparison?: ComparisonResult,
  recommendation?: RecommendationResult,
  inputs?: CalculationInputs | null,
): ExportFile[] {
  return [
    detailCsv(calculation),
    metricsJson(calculation),
    decisionJson(calculation, catalog, recommendation, inputs),
    analysisJson(calculation, comparison, recommendation),
  ]
}
