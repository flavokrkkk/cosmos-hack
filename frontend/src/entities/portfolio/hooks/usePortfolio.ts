import { useMutation, useQuery } from '@tanstack/react-query'

import type {
  CompareRequest, ComparisonAnalysisRequest, EvaluateRequest, RecommendRequest,
  SelectionItem,
} from '@shared/api/contracts'

import { portfolioService } from '../api'
import { selectionKey, sortedLotIds } from '../lib/selection'

export const portfolioKeys = {
  evaluate: (datasetHash: string, selection: readonly SelectionItem[]) =>
    ['portfolio', 'evaluate', datasetHash, selectionKey(selection)] as const,
  recommend: (datasetHash: string, requireStress: boolean, lotIds: readonly string[] | null) =>
    ['portfolio', 'recommend', datasetHash, requireStress, lotIds ? sortedLotIds(lotIds) : null] as const,
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

type RecommendParams = {
  datasetHash: string | undefined
  requireStress: boolean
  /** Ровно четыре лота для подбора режимов; `null` — полный автоподбор. */
  lotIds: readonly string[] | null
  enabled: boolean
}

/**
 * Подбор возвращает расчёты вместе с пакетными объяснениями.
 * Повторная генерация и срок кеширования управляются бэкендом.
 */
export function useRecommendation({ datasetHash, requireStress, lotIds, enabled }: RecommendParams) {
  return useQuery({
    queryKey: portfolioKeys.recommend(datasetHash ?? '', requireStress, lotIds),
    queryFn: ({ signal }) =>
      portfolioService.recommend({
        dataset_hash: datasetHash as string,
        require_stress: requireStress,
        method_id: 'pareto_lexicographic_v1',
        lot_ids: lotIds ? sortedLotIds(lotIds) : null,
      } satisfies RecommendRequest, signal),
    enabled: enabled && Boolean(datasetHash) && (lotIds === null || lotIds.length === 4),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    /* Ошибку показываем на странице рядом с кнопкой «Повторить», тост был бы дублем. */
    meta: { skipErrorToast: true },
  })
}

/**
 * Сопоставление вариантов — действие по кнопке.
 * Считает бэкенд той же арифметикой, что и одиночные портфели; фронтенд дельты
 * не выводит. Принимает 2–4 полных портфеля — иначе 422.
 */
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
