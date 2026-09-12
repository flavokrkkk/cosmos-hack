import { selectionKey, type SavedVariant } from '@entities/portfolio'
import type { Calculation, RecommendationResult, Scenario, SelectionItem } from '@shared/api/contracts'

/** Бэкенд принимает от 2 до 4 вариантов (`CompareRequest.variants`). */
export const MIN_VARIANTS = 2
export const MAX_VARIANTS = 4

export type CandidateSource = 'team' | 'reference' | 'manual' | 'saved'

export type Candidate = {
  /** Устойчивый ключ: состав портфеля, а не позиция в списке. */
  id: string
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

  const push = (candidate: Omit<Candidate, 'id' | 'sourceLabel'>) => {
    const id = selectionKey(candidate.selection)
    if (seen.has(id)) return
    seen.add(id)
    candidates.push({ ...candidate, id, sourceLabel: SOURCE_LABEL[candidate.source] })
  }

  if (custom && custom.dataset_hash === datasetHash) {
    push({
      title: 'Ваш вариант',
      source: 'manual',
      reason: '',
      selection: custom.selection,
      feasible: custom.feasible_by_scenario,
    })
  }

  if (auto?.recommended) {
    push({
      title: 'Рекомендованный портфель',
      source: 'team',
      reason: auto.recommended.reason,
      selection: auto.recommended.calculation.selection,
      feasible: auto.recommended.calculation.feasible_by_scenario,
    })
  }
  for (const variant of auto?.alternatives ?? []) {
    push({
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
      title: 'Рекомендация из выбранных лотов',
      source: 'manual',
      reason: 'Алгоритм выбрал четыре лота и их режимы из вашего набора кандидатов.',
      selection: manual.recommended.calculation.selection,
      feasible: manual.recommended.calculation.feasible_by_scenario,
    })
  }
  for (const variant of manual?.alternatives ?? []) {
    push({
      title: `Ручная: ${variant.title}`,
      source: 'manual',
      reason: variant.reason,
      selection: variant.calculation.selection,
      feasible: variant.calculation.feasible_by_scenario,
    })
  }
  for (const item of saved) {
    push({
      title: item.name,
      source: 'saved',
      reason: item.comment,
      selection: item.selection,
      feasible: item.feasible,
      incompatible: item.datasetHash !== datasetHash,
    })
  }

  return candidates
}
