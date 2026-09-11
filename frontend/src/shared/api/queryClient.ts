import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { notifyApiError } from '@shared/lib/notify'

import { normalizeApiError } from './apiError'

/**
 * Мета запросов и мутаций.
 * `skipErrorToast` — когда ошибка показывается в самом интерфейсе (например,
 * под полем формы) и тост был бы дублем.
 */
type AppMeta = {
  skipErrorToast?: boolean
  errorMessage?: string
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
