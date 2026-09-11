import { useMutation, useQuery } from '@tanstack/react-query'

import type {
  CompareRequest, EvaluateRequest, PortfolioExplanationRequest, RecommendRequest, Scenario,
  SelectionItem,
} from '@shared/api/contracts'

import { portfolioService } from '../api'
import { selectionKey, sortedLotIds } from '../lib/selection'

export const portfolioKeys = {
  evaluate: (datasetHash: string, selection: readonly SelectionItem[]) =>
    ['portfolio', 'evaluate', datasetHash, selectionKey(selection)] as const,
  recommend: (datasetHash: string, requireStress: boolean, lotIds: readonly string[] | null) =>
    ['portfolio', 'recommend', datasetHash, requireStress, lotIds ? sortedLotIds(lotIds) : null] as const,
  explanation: (datasetHash: string, selection: readonly SelectionItem[], scenario: Scenario) =>
    ['portfolio', 'explanation', datasetHash, selectionKey(selection), scenario] as const,
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
 * Подбор — запрос, а не мутация: результат полностью определяется входами
 * (версия данных, условие STRESS, набор лотов), поэтому кешируется по ним,
 * переживает перезагрузку и не запрашивается дважды для одних условий.
 * «Подобрать заново» с теми же условиями — `refetch()`.
 */
export function useRecommendation({ datasetHash, requireStress, lotIds, enabled }: RecommendParams) {
  return useQuery({
    queryKey: portfolioKeys.recommend(datasetHash ?? '', requireStress, lotIds),
    queryFn: () =>
      portfolioService.recommend({
        dataset_hash: datasetHash as string,
        require_stress: requireStress,
        method_id: 'pareto_lexicographic_v1',
        lot_ids: lotIds ? sortedLotIds(lotIds) : null,
      } satisfies RecommendRequest),
    enabled: enabled && Boolean(datasetHash) && (lotIds === null || lotIds.length === 4),
    staleTime: Infinity,
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

/**
 * Объяснение — запрос, включаемый по действию пользователя (`enabled`), а не
 * мутация: результат определяется составом, сценарием и версией данных, поэтому
 * кешируется по ним и переживает перезагрузку. Бэкенд может отвечать десятки
 * секунд; повтор при сетевой ошибке не нужен — пользователь нажмёт «Повторить».
 */
export function useExplanation(
  datasetHash: string | undefined,
  selection: readonly SelectionItem[],
  scenario: Scenario,
  enabled: boolean,
) {
  return useQuery({
    queryKey: portfolioKeys.explanation(datasetHash ?? '', selection, scenario),
    queryFn: ({ signal }) =>
      portfolioService.explain({
        dataset_hash: datasetHash as string,
        selection: [...selection],
        scenario,
      } satisfies PortfolioExplanationRequest, signal),
    enabled: enabled && Boolean(datasetHash) && selection.length === 4,
    staleTime: Infinity,
    retry: false,
    meta: { skipErrorToast: true },
  })
}
