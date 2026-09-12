import { type SavedVariant } from '@entities/portfolio'
import type { CalculationInputs, Calculation, RecommendationResult, Scenario, SelectionItem } from '@shared/api/contracts'

/** Бэкенд принимает от 2 до 4 вариантов (`CompareRequest.variants`). */
export const MIN_VARIANTS = 2
export const MAX_VARIANTS = 4

export type CandidateSource = 'team' | 'reference' | 'manual' | 'saved'

export type Candidate = {
  /** Хеш расчёта: состав, входы и версия движка, а не позиция в списке. */
  id: string
  inputs: CalculationInputs | null
  title: string
  source: CandidateSource
  sourceLabel: string
  reason: string
  selection: SelectionItem[]
  feasible: Record<Scenario, boolean> | null
  /** Сохранён под другой версией данных — сравнивать нельзя, только показать. */
  incompatible?: boolean
}

const SOURCE_LABEL: Record<CandidateSource, string> = {
  team: 'портфель команды',
  reference: 'альтернатива',
  manual: 'ручная проверка',
  saved: 'сохранённый вариант',
}

type Input = {
  datasetHash: string
  auto: RecommendationResult | undefined
  manual: RecommendationResult | undefined
  saved: SavedVariant[]
  custom?: Calculation
}

/**
 * Кандидаты на сравнение.
 *
 * Все получены одним движком на одной версии данных: портфель команды и опорные
 * точки фронта — из ответа автоподбора, ручной вариант — из подбора режимов для
 * выбранных лотов, сохранённые — из списка пользователя. Специально ослабленных вариантов
 * «для красивого сравнения» здесь нет: список не сочиняется, а собирается.
 */
export function buildCandidates({ datasetHash, auto, manual, saved, custom }: Input): Candidate[] {
  const candidates: Candidate[] = []
  const seen = new Set<string>()

  const push = (candidate: Omit<Candidate, 'sourceLabel'>) => {
    const id = candidate.id
    if (seen.has(id)) return
    seen.add(id)
    candidates.push({ ...candidate, id, sourceLabel: SOURCE_LABEL[candidate.source] })
  }

  if (custom && custom.dataset_hash === datasetHash) {
    push({
      id: custom.input_hash, inputs: custom.inputs,
      title: 'Ваш вариант',
      source: 'manual',
      reason: '',
      selection: custom.selection,
      feasible: custom.feasible_by_scenario,
    })
  }

  if (auto?.recommended) {
    push({
      id: auto.recommended.calculation.input_hash, inputs: auto.recommended.calculation.inputs,
      title: 'Рекомендованный портфель',
      source: 'team',
      reason: auto.recommended.reason,
      selection: auto.recommended.calculation.selection,
      feasible: auto.recommended.calculation.feasible_by_scenario,
    })
  }
  for (const variant of auto?.alternatives ?? []) {
    push({
      id: variant.calculation.input_hash, inputs: variant.calculation.inputs,
      title: variant.title,
      source: 'reference',
      reason: variant.reason,
      selection: variant.calculation.selection,
      feasible: variant.calculation.feasible_by_scenario,
    })
  }
  /* Ручная проверка: рекомендованная четвёрка и опорные точки внутри набора кандидатов. */
  if (manual?.recommended) {
    push({
      id: manual.recommended.calculation.input_hash, inputs: manual.recommended.calculation.inputs,
      title: 'Рекомендация из выбранных лотов',
      source: 'manual',
      reason: 'Алгоритм выбрал четыре лота и их режимы из вашего набора кандидатов.',
      selection: manual.recommended.calculation.selection,
      feasible: manual.recommended.calculation.feasible_by_scenario,
    })
  }
  for (const variant of manual?.alternatives ?? []) {
    push({
      id: variant.calculation.input_hash, inputs: variant.calculation.inputs,
      title: `Ручная: ${variant.title}`,
      source: 'manual',
      reason: variant.reason,
      selection: variant.calculation.selection,
      feasible: variant.calculation.feasible_by_scenario,
    })
  }
  for (const item of saved) {
    push({
      id: item.inputHash, inputs: item.inputs,
      title: item.name,
      source: 'saved',
      reason: item.comment,
      selection: item.selection,
      feasible: item.feasible,
      incompatible: item.datasetHash !== datasetHash || item.missingInputs,
    })
  }

  return candidates
}
