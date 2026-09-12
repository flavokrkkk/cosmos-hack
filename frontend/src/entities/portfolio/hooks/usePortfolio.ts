import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'

import type {
  CompareRequest, ComparisonAnalysisRequest, EvaluateRequest, RecommendRequest, SelectionItem,
} from '@shared/api/contracts'

import { portfolioService } from '../api'
import { selectionKey, sortedLotIds } from '../lib/selection'
import { useWorkspace, type SearchSettings } from '../model/workspace'

export const portfolioKeys = {
  evaluate: (datasetHash: string, selection: readonly SelectionItem[]) =>
    ['portfolio', 'evaluate', datasetHash, selectionKey(selection)] as const,
  recommend: (
    datasetHash: string, requireStress: boolean, lotIds: readonly string[] | null, withExplanations: boolean,
  ) =>
    ['portfolio', 'recommend', datasetHash, requireStress, lotIds ? sortedLotIds(lotIds) : null, withExplanations] as const,
}

/**
 * Пересчёт заданного состава. Ключ включает и версию данных, и сам состав —
 * поздний ответ по старому выбору не может перезаписать свежий результат.
 * Расчёт детерминирован, поэтому никогда не протухает: те же входы — те же числа.
 */
export function useEvaluate(datasetHash: string | undefined, selection: readonly SelectionItem[], enabled = true) {
  return useQuery({
    queryKey: portfolioKeys.evaluate(datasetHash ?? '', selection),
    queryFn: () =>
      portfolioService.evaluate({
        dataset_hash: datasetHash as string,
        selection: [...selection],
      } satisfies EvaluateRequest),
    enabled: enabled && Boolean(datasetHash) && selection.length > 0,
    staleTime: Infinity,
    meta: { errorMessage: 'Не удалось пересчитать портфель' },
  })
}

export type RecommendParams = {
  datasetHash: string | undefined
  requireStress: boolean
  /** Четыре–восемь лотов-кандидатов; `null` — полный автоподбор. */
  lotIds: readonly string[] | null
  enabled: boolean
  settings?: SearchSettings
}

function recommendRequest(params: RecommendParams, withExplanations: boolean): RecommendRequest {
  const settings = params.settings ?? useWorkspace.getState().searchSettings
  return {
    dataset_hash: params.datasetHash as string,
    require_stress: params.requireStress,
    method_id: settings.methodId,
    weights: settings.weights,
    budget_cap_mrub: settings.budgetCap,
    vpub_floor_mrub_per_year: settings.vpubFloor,
    required_public_lot_ids: sortedLotIds(settings.publicLotIds),
    lot_ids: params.lotIds ? sortedLotIds(params.lotIds) : null,
    with_explanations: withExplanations,
  }
}

function recommendEnabled({ datasetHash, lotIds, enabled }: RecommendParams): boolean {
  return enabled && Boolean(datasetHash) && (lotIds === null || (lotIds.length >= 4 && lotIds.length <= 8))
}

/**
 * Первый шаг подбора — только расчёт и фронт (`with_explanations: false`, доли
 * секунды). Вынесен в options, чтобы те же ключ и функция служили и хуку, и
 * предзагрузке: результат детерминирован, поэтому не протухает.
 */
export function recommendationQueryOptions(params: RecommendParams) {
  const request = recommendRequest(params, false)
  return queryOptions({
    queryKey: [...portfolioKeys.recommend(params.datasetHash ?? '', params.requireStress, params.lotIds, false), request],
    queryFn: ({ signal }) => portfolioService.recommend(request, signal, 30_000),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    /* Ошибку показываем на странице рядом с кнопкой «Повторить», тост был бы дублем. */
    meta: { skipErrorToast: true },
  })
}

/** Подбор в два шага: числа видны сразу; «Подобрать заново» — `refetch()`. */
export function useRecommendation(params: RecommendParams) {
  const settings = useWorkspace((state) => state.searchSettings)
  return useQuery({
    ...recommendationQueryOptions({ ...params, settings: params.settings ?? settings }),
    enabled: recommendEnabled(params),
  })
}

/**
 * Второй шаг — тот же подбор с пакетным объяснением от модели. Бэкенд считает
 * объяснение один раз на все варианты и кеширует; на процессоре это до
 * полутора минут, поэтому запрос идёт после первого и никого не блокирует.
 * В браузере не персистится: шаблонный ответ при недоступной модели не должен
 * пережить перезагрузку.
 */
export function useRecommendationExplanations(params: RecommendParams) {
  const settings = useWorkspace((state) => state.searchSettings)
  const request = recommendRequest({ ...params, settings: params.settings ?? settings }, true)
  return useQuery({
    queryKey: [...portfolioKeys.recommend(params.datasetHash ?? '', params.requireStress, params.lotIds, true), request],
    queryFn: ({ signal }) => portfolioService.recommend(request, signal, 150_000),
    enabled: recommendEnabled(params),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    meta: { skipErrorToast: true, persist: false },
  })
}

export function useCompare() {
  return useMutation({
    mutationFn: (request: CompareRequest) => portfolioService.compare(request),
    meta: { errorMessage: 'Не удалось сравнить варианты' },
  })
}

export function useComparisonAnalysis(request: ComparisonAnalysisRequest, enabled: boolean) {
  return useQuery({
    queryKey: ['portfolio', 'comparison-analysis', request],
    queryFn: ({ signal }) => portfolioService.analyzeComparison(request, signal),
    enabled,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    meta: { skipErrorToast: true },
  })
}
