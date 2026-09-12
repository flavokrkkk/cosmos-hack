import type { Calculation, CaseCatalog, ComparisonResult, Scenario } from '@shared/api/contracts'
import { SCENARIOS } from '@shared/api/contracts'

import { DELTA_ROWS } from './compare'

/**
 * Выгрузка расчёта в том же формате, что даёт `python -m engine export`.
 *
 * Формат не придуман здесь: имена файлов и колонки повторяют контрольные
 * снимки в [`results/`](../../../../../results) — `portfolio_detail.csv`,
 * `portfolio_metrics.json`, `constraints_BASE.csv`, `constraints_STRESS.csv`.
 * Требование рубрики: цифры в записке, на слайдах и в выводе инструмента
 * обязаны совпадать, поэтому расходиться форматами нельзя.
 *
 * Числа берутся из ответа бэкенда как есть, без округления и без арифметики на
 * фронтенде: JSON отдаёт полную точность (`kcash = 1.0181531176006313`).
 * Интерфейс округляет только при показе.
 */

export type ExportFile = {
  name: string
  mime: string
  content: string
}

/** Экранирование по RFC 4180 — как это делает `pandas.to_csv`. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const head = columns.join(',')
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))
  return [head, ...body].join('\n') + '\n'
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

const DETAIL_COLUMNS = [
  'lot_id', 'mode_id', 'c0_mrub', 'opex_mrub_per_year', 'vpub_mrub_per_year',
  'cash_mrub_per_year', 't_rep', 'readiness_1_5', 'resilience_1_5', 'scale_1_5',
  'territorial_archetype', 'federal', 'capability_groups', 'public_core',
] as const

/** Колонки контрольных `constraints_*.csv`: статус словом, не булевым. */
const CONSTRAINT_COLUMNS = [
  'code', 'title', 'operator', 'threshold', 'actual', 'unit', 'slack', 'status',
] as const

export function detailCsv(calculation: Calculation): ExportFile {
  return {
    name: 'portfolio_detail.csv',
    mime: 'text/csv;charset=utf-8',
    content: csv(DETAIL_COLUMNS, calculation.detail),
  }
}

export function metricsJson(calculation: Calculation): ExportFile {
  return {
    name: 'portfolio_metrics.json',
    mime: 'application/json;charset=utf-8',
    content: json(calculation.metrics),
  }
}

export function constraintsCsv(calculation: Calculation, scenario: Scenario): ExportFile {
  const checks = calculation.checks[scenario] ?? []
  return {
    name: `constraints_${scenario}.csv`,
    mime: 'text/csv;charset=utf-8',
    content: csv(
      CONSTRAINT_COLUMNS,
      checks.map((check) => ({ ...check, status: check.passed ? 'PASS' : 'FAIL' })),
    ),
  }
}

/**
 * `calculation_snapshot.json` — то, что делает расчёт воспроизводимым.
 * Имя не совпадает с `config/decision.json`: это снимок расчёта, а не решение команды.
 *
 * Здесь ответы бэкенда лежат дословно: `dataset_hash` привязывает снимок к
 * версии исходных данных, `input_hash` — к конкретному составу, `engine_version`
 * — к версии формул. При тех же трёх значениях повторный запуск обязан дать
 * те же числа.
 */
export function decisionJson(
  calculation: Calculation,
  catalog: CaseCatalog,
  comparison?: ComparisonResult,
): ExportFile {
  return {
    name: 'calculation_snapshot.json',
    mime: 'application/json;charset=utf-8',
    content: json({
      case_id: catalog.case_id,
      case_version: catalog.case_version,
      dataset_hash: calculation.dataset_hash,
      engine_version: calculation.engine_version,
      input_hash: calculation.input_hash,
      method: catalog.methods[0] ?? null,
      source_refs: catalog.source_refs,
      exported_at: new Date().toISOString(),
      exported_by: 'frontend/dashboard',
      calculation,
      comparison: comparison ?? null,
    }),
  }
}

/** `comparison.csv` — сопоставление вариантов, критерий Т4. */
export function comparisonCsv(result: ComparisonResult): ExportFile {
  const columns = [
    'variant_index', 'is_baseline', 'selection',
    ...SCENARIOS.map((scenario) => `feasible_${scenario}`),
    ...SCENARIOS.map((scenario) => `failed_${scenario}`),
    ...DELTA_ROWS.map((row) => row.key),
    ...DELTA_ROWS.map((row) => `delta_${row.key}`),
  ]
  const rows = result.variants.map((variant, index) => {
    const metrics = variant.metrics
    const delta = result.deltas[index] ?? {}
    const row: Record<string, unknown> = {
      variant_index: index,
      is_baseline: index === result.baseline_index,
      selection: variant.selection.map((item) => `${item.lot_id}:${item.mode_id}`).join(' '),
    }
    for (const scenario of SCENARIOS) {
      row[`feasible_${scenario}`] = variant.feasible_by_scenario[scenario] ? 'PASS' : 'FAIL'
      row[`failed_${scenario}`] = (variant.checks[scenario] ?? [])
        .filter((check) => !check.passed)
        .map((check) => check.code)
        .join(' ')
    }
    for (const { key } of DELTA_ROWS) {
      row[key] = metrics ? metrics[key] : ''
      row[`delta_${key}`] = delta[key] ?? ''
    }
    return row
  })
  return { name: 'comparison.csv', mime: 'text/csv;charset=utf-8', content: csv(columns, rows) }
}

/** Полный набор файлов для текущего расчёта. */
export function snapshotFiles(
  calculation: Calculation,
  catalog: CaseCatalog,
  comparison?: ComparisonResult,
): ExportFile[] {
  const files = [
    decisionJson(calculation, catalog, comparison),
    metricsJson(calculation),
    detailCsv(calculation),
    ...SCENARIOS.map((scenario) => constraintsCsv(calculation, scenario)),
  ]
  if (comparison) files.push(comparisonCsv(comparison))
  return files
}
