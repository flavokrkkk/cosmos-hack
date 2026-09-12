import { useEvaluate, useSavedVariants, useWorkspace, type SavedVariant } from '@entities/portfolio'
import type { Calculation, RecommendationResult, RecommendationVariant } from '@shared/api/contracts'

export type ActiveVariantKind = 'team' | 'reference' | 'saved' | 'custom'

export type ActiveVariantView = {
  /** `team` — портфель команды из ответа подбора, `reference` — опорная точка фронта. */
  kind: ActiveVariantKind
  title: string
  reason: string
  calculation: Calculation | undefined
  savedVariant?: SavedVariant
  /** Индекс в `result.alternatives`, если открыта опорная точка. */
  alternativeIndex?: number
  /** Открыт вариант «по умолчанию» — тот же, что показан карточками сверху. */
  isDefault: boolean
  isLoading: boolean
  isError: boolean
  retry: () => void
}

/**
 * Какой расчёт показывают блоки «Текущий портфель» и «Проверка».
 *
 * Портфель команды и опорные точки уже лежат в ответе подбора — новых запросов
 * нет. Сохранённый вариант хранится входами, поэтому пересчитывается через
 * evaluate. Если открытая опорная точка исчезла после нового подбора,
 * показываем вариант по умолчанию.
 */
export function useActiveVariant(
  datasetHash: string | undefined,
  result: RecommendationResult | undefined,
): ActiveVariantView {
  const mode = useWorkspace((state) => state.mode)
  const active = useWorkspace((state) => state.activeVariant[mode])
  const calculationInputs = useWorkspace((state) => state.calculationInputs)
  const savedItems = useSavedVariants((state) => state.items)

  const savedVariant =
    active.kind === 'saved' ? savedItems.find((item) => item.id === active.id) : undefined
  const compatibleSaved = Boolean(savedVariant && savedVariant.datasetHash === datasetHash)
  const evaluation = useEvaluate(
    datasetHash,
    active.kind === 'custom' ? active.selection : savedVariant?.selection ?? [],
    active.kind === 'custom' || compatibleSaved,
    calculationInputs,
  )

  if (active.kind === 'custom') {
    return {
      kind: 'custom',
      title: 'Ваш вариант',
      reason: '',
      calculation: evaluation.data,
      isDefault: false,
      isLoading: evaluation.isPending,
      isError: evaluation.isError,
      retry: () => void evaluation.refetch(),
    }
  }

  if (active.kind === 'saved' && savedVariant) {
    return {
      kind: 'saved',
      title: savedVariant.name,
      reason: savedVariant.comment,
      calculation: compatibleSaved ? evaluation.data : undefined,
      savedVariant,
      isDefault: false,
      isLoading: compatibleSaved && evaluation.isPending,
      isError: !compatibleSaved || evaluation.isError,
      retry: () => { if (compatibleSaved) void evaluation.refetch() },
    }
  }

  if (active.kind === 'alternative') {
    const variant = result?.alternatives[active.index]
    if (variant) {
      const isDefault = !result?.recommended && active.index === 0
      return referenceView(variant, active.index, isDefault)
    }
  }

  return defaultView(result)
}

/** Вариант по умолчанию: портфель команды, а без него — первая опорная точка. */
export function defaultVariant(
  result: RecommendationResult | undefined,
): { kind: 'team' | 'reference'; variant: RecommendationVariant; index?: number } | undefined {
  if (result?.recommended) return { kind: 'team', variant: result.recommended }
  const first = result?.alternatives[0]
  if (first) return { kind: 'reference', variant: first, index: 0 }
  return undefined
}

function defaultView(result: RecommendationResult | undefined): ActiveVariantView {
  const fallback = defaultVariant(result)
  if (!fallback) {
    return {
      kind: 'team',
      title: 'Рекомендованный портфель',
      reason: '',
      calculation: undefined,
      isDefault: true,
      isLoading: false,
      isError: false,
      retry: () => {},
    }
  }
  if (fallback.kind === 'reference') return referenceView(fallback.variant, fallback.index ?? 0, true)
  return {
    kind: 'team',
    title: 'Рекомендованный портфель',
    reason: fallback.variant.reason,
    calculation: fallback.variant.calculation,
    isDefault: true,
    isLoading: false,
    isError: false,
    retry: () => {},
  }
}

function referenceView(variant: RecommendationVariant, index: number, isDefault: boolean): ActiveVariantView {
  return {
    kind: 'reference',
    title: variant.title,
    reason: variant.reason,
    calculation: variant.calculation,
    alternativeIndex: index,
    isDefault,
    isLoading: false,
    isError: false,
    retry: () => {},
  }
}
