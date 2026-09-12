import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'

import { notifyApiError } from '@shared/lib/notify'

import { normalizeApiError } from './apiError'

/**
 * Мета запросов и мутаций.
 * `skipErrorToast` — когда ошибка показывается в самом интерфейсе (например,
 * под полем формы) и тост был бы дублем.
 * `persist: false` — результат не кладём в sessionStorage (например, опрос задачи).
 */
type AppMeta = {
  skipErrorToast?: boolean
  errorMessage?: string
  persist?: boolean
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: AppMeta
    mutationMeta: AppMeta
  }
}

/** Повторять только сетевые сбои и 5xx: на 4xx повтор бессмысленный. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const { status } = normalizeApiError(error)
  if (status !== null && status >= 400 && status < 500) return false
  return failureCount < 2
}

/**
 * Единый перехват ошибок: любой упавший запрос или мутация показывает тост.
 * Локально обрабатывать ошибку нужно только там, где нужен особый UI.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: shouldRetry,
    },
    mutations: {
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.skipErrorToast) return
      notifyApiError(error, query.meta?.errorMessage)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.meta?.skipErrorToast) return
      notifyApiError(error, mutation.options.meta?.errorMessage)
    },
  }),
})

/**
 * Кеш запросов переживает перезагрузку вкладки.
 *
 * Расчёты детерминированы (те же входы → те же числа), а каждый ключ включает
 * `dataset_hash`, поэтому восстановленный из sessionStorage ответ не может
 * относиться к другой версии данных. Живёт ровно столько, сколько вкладка:
 * sessionStorage — «в рамках сессии», как и рабочее состояние страницы.
 *
 * `sessionStorage` может быть недоступен (приватный режим, отключённое хранилище) —
 * тогда persister не создаётся и приложение работает без восстановления кеша.
 */
function createPersistOptions(): Omit<PersistQueryClientOptions, 'queryClient'> | null {
  try {
    const storage = window.sessionStorage
    storage.getItem('__probe__')
    return {
      persister: createSyncStoragePersister({ storage, key: 'cosmos-query-cache' }),
      maxAge: 24 * 60 * 60 * 1000,
      buster: 'v9-calculation-input-snapshots',
      dehydrateOptions: {
        shouldDehydrateQuery: (query) =>
          query.state.status === 'success' && query.meta?.persist !== false,
      },
    }
  } catch {
    return null
  }
}

export const persistOptions = createPersistOptions()
