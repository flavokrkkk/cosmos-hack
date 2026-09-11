import { useCallback, useMemo, useState } from 'react'

import type { RecommendationResult, SelectionItem } from '@shared/api/contracts'

/** Бэкенд принимает от 2 до 4 вариантов (`CompareRequest.variants`). */
export const MIN_VARIANTS = 2
export const MAX_VARIANTS = 4

export type CandidateSource = 'recommended' | 'alternative' | 'draft'

export type Candidate = {
  /** Устойчивый ключ: состав портфеля, а не позиция в списке. */
  id: string
  title: string
  /** Откуда вариант взялся — эксперт должен видеть происхождение. */
  source: CandidateSource
  sourceLabel: string
  reason: string
  selection: SelectionItem[]
}

function key(selection: SelectionItem[]): string {
  return [...selection]
    .map((item) => `${item.lot_id}:${item.mode_id}`)
    .sort()
    .join('|')
}

const SOURCE_LABEL: Record<CandidateSource, string> = {
  recommended: 'рекомендация алгоритма',
  alternative: 'альтернатива из перебора',
  draft: 'ручная сборка',
}

/**
 * Кандидаты на сравнение.
 *
 * Все они получены одним перебором и одним правилом выбора: рекомендация и
 * альтернативы — недоминируемые варианты из ответа `/portfolio/recommend`,
 * ручной портфель — то, что собрал пользователь. Специально ослабленных
 * вариантов «для красивого сравнения» здесь нет и быть не может: список не
 * конструируется, а берётся из результата перебора.
 */
export function buildCandidates(
  recommendation: RecommendationResult | undefined,
  draft: SelectionItem[],
  draftOrigin: 'empty' | 'manual' | 'copy',
): Candidate[] {
  const candidates: Candidate[] = []

  if (recommendation?.recommended) {
    candidates.push({
      id: key(recommendation.recommended.calculation.selection),
      title: recommendation.recommended.title,
      source: 'recommended',
      sourceLabel: SOURCE_LABEL.recommended,
      reason: recommendation.recommended.reason,
      selection: recommendation.recommended.calculation.selection,
    })
  }

  for (const variant of recommendation?.alternatives ?? []) {
    const id = key(variant.calculation.selection)
    if (candidates.some((candidate) => candidate.id === id)) continue
    candidates.push({
      id,
      title: variant.title,
      source: 'alternative',
      sourceLabel: SOURCE_LABEL.alternative,
      reason: variant.reason,
      selection: variant.calculation.selection,
    })
  }

  // Ручной портфель добавляется, только если он полный и отличается от уже
  // собранных: дублировать рекомендацию её же копией бессмысленно.
  if (draft.length === MAX_VARIANTS) {
    const id = key(draft)
    if (!candidates.some((candidate) => candidate.id === id)) {
      candidates.push({
        id,
        title: draftOrigin === 'copy' ? 'Правка рекомендации' : 'Ручной портфель',
        source: 'draft',
        sourceLabel: SOURCE_LABEL.draft,
        reason:
          draftOrigin === 'copy'
            ? 'Копия рекомендации с изменёнными вручную лотами или режимами.'
            : 'Состав, собранный вручную в каталоге лотов.',
        selection: draft,
      })
    }
  }

  return candidates
}

/**
 * Какие варианты выбраны для сравнения.
 *
 * Первый выбранный — база сравнения: бэкенд считает дельты к `variants[0]`,
 * и порядок отправки определяет, к чему считается «выигрыш» и «плата».
 */
export function useComparisonSet(candidates: Candidate[]) {
  const [picked, setPicked] = useState<string[]>([])

  const available = useMemo(() => new Set(candidates.map((item) => item.id)), [candidates])

  // Кандидат мог исчезнуть после нового перебора — держим только живые id.
  const selectedIds = useMemo(
    () => picked.filter((id) => available.has(id)),
    [picked, available],
  )

  const toggle = useCallback((id: string) => {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= MAX_VARIANTS) return current
      return [...current, id]
    })
  }, [])

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => candidates.find((candidate) => candidate.id === id))
        .filter((candidate): candidate is Candidate => Boolean(candidate)),
    [selectedIds, candidates],
  )

  const reset = useCallback(() => setPicked([]), [])

  return {
    selected,
    selectedIds,
    toggle,
    reset,
    isFull: selectedIds.length >= MAX_VARIANTS,
    canCompare: selectedIds.length >= MIN_VARIANTS,
  }
}
