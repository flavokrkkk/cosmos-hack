import { toast } from 'sonner'

// Импорт напрямую из модуля, а не из баррела @shared/api, чтобы не замыкать цикл
// (queryClient импортирует notify).
import { normalizeApiError } from '@shared/api/apiError'

/**
 * Показывает ошибку бэкенда тостом.
 *
 * Дедупликация по тексту: если несколько запросов упали с одной причиной
 * (например, backend не поднят), пользователь увидит один тост, а не десять.
 */
export function notifyApiError(error: unknown, overrideMessage?: string) {
  const apiError = normalizeApiError(error)
  const title = overrideMessage ?? apiError.message

  const rest = apiError.fieldErrors.slice(overrideMessage ? 0 : 1)
  const description = rest.length
    ? rest.map((item) => `${item.field}: ${item.message}`).join('\n')
    : undefined

  toast.error(title, { id: `api-error:${title}`, description })
}

export function notifySuccess(message: string, description?: string) {
  toast.success(message, { description })
}

export function notifyInfo(message: string, description?: string) {
  toast(message, { description })
}
