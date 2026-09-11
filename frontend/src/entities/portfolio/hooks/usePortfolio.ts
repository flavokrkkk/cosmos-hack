import { useMutation, useQuery } from '@tanstack/react-query'

import type {
  CompareRequest, EvaluateRequest, RecommendRequest, SelectionItem,
} from '@shared/api/contracts'

import { portfolioService } from '../api'

export const portfolioKeys = {
  evaluate: (datasetHash: string, selection: SelectionItem[]) =>
    ['portfolio', 'evaluate', datasetHash, selection] as const,
}

/**
 * Пересчёт текущего выбора. Ключ включает и версию данных, и сам выбор —
 * поздний ответ по старому выбору не может перезаписать свежий результат.
 * Запрос не уходит, пока нет каталога или выбор пуст.
 */
export function useEvaluate(datasetHash: string | undefined, selection: SelectionItem[]) {
  return useQuery({
    queryKey: portfolioKeys.evaluate(datasetHash ?? '', selection),
    queryFn: () =>
      portfolioService.evaluate({
        dataset_hash: datasetHash as string,
        selection,
      } satisfies EvaluateRequest),
    enabled: Boolean(datasetHash) && selection.length > 0,
    meta: { errorMessage: 'Не удалось пересчитать портфель' },
  })
}

/**
 * Подбор — мутация, а не запрос: это действие пользователя по кнопке,
 * а не состояние, которое нужно держать синхронным с сервером.
 */
export function useRecommend() {
  return useMutation({
    mutationFn: (request: RecommendRequest) => portfolioService.recommend(request),
    meta: { errorMessage: 'Не удалось подобрать портфель' },
  })
}

/**
 * Сопоставление вариантов — тоже действие по кнопке.
 *
 * Считает бэкенд: он же считал и одиночные портфели, поэтому колонки сравнения
 * гарантированно получены одной и той же арифметикой. Фронтенд не пересчитывает
 * показатели и не выводит дельты самостоятельно.
 *
 * Бэкенд принимает от 2 до 4 вариантов и требует полные портфели из четырёх
 * лотов — иначе 422.
 */
export function useCompare() {
  return useMutation({
    mutationFn: (request: CompareRequest) => portfolioService.compare(request),
    meta: { errorMessage: 'Не удалось сравнить варианты' },
  })
}
