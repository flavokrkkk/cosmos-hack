import { AxiosError } from 'axios'

/** Ошибка конкретного поля формы: путь до поля и текст. */
export type ApiFieldError = {
  field: string
  message: string
}

/**
 * Нормализованная ошибка бэкенда.
 *
 * Нужна потому, что FastAPI отдаёт `detail` в двух несовместимых формах:
 * строкой (401/403/404) и массивом объектов валидации (422). Раньше ответ
 * заворачивали в `new Error(detail)`, и массив объектов превращался в
 * «[object Object]».
 */
export class ApiError extends Error {
  readonly status: number | null
  readonly fieldErrors: ApiFieldError[]
  readonly isNetworkError: boolean
  readonly payload: unknown

  constructor(params: {
    message: string
    status?: number | null
    fieldErrors?: ApiFieldError[]
    isNetworkError?: boolean
    payload?: unknown
  }) {
    super(params.message)
    this.name = 'ApiError'
    this.status = params.status ?? null
    this.fieldErrors = params.fieldErrors ?? []
    this.isNetworkError = params.isNetworkError ?? false
    this.payload = params.payload
  }
}

/** Понятные тексты для статусов, если бэкенд не прислал своего сообщения. */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Некорректный запрос',
  401: 'Неверный логин или пароль',
  403: 'Нет доступа',
  404: 'Не найдено',
  409: 'Конфликт данных',
  422: 'Проверьте правильность заполнения полей',
  429: 'Слишком много запросов, попробуйте позже',
  500: 'Ошибка на сервере',
  502: 'Сервер недоступен',
  503: 'Сервис временно недоступен',
  504: 'Сервер не ответил вовремя',
}

/**
 * Технические англоязычные сообщения бэкенда → человеческий русский.
 * Словарь маленький и явный: дополняется по мере появления новых ответов.
 */
const MESSAGE_DICTIONARY: Record<string, string> = {
  'invalid credentials': 'Неверный логин или пароль',
  forbidden: 'Нет доступа',
  'not found': 'Не найдено',
  'not authenticated': 'Требуется вход',
  'internal server error': 'Ошибка на сервере',
}

/**
 * Типовые сообщения pydantic приходят по-английски и с подстановками.
 * Переводим самые частые — остальные показываем как есть.
 */
const MESSAGE_PATTERNS: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^field required$/i, () => 'Обязательное поле'],
  [/^string should have at least (\d+) characters?$/i, (m) => `Не короче ${m[1]} символов`],
  [/^string should have at most (\d+) characters?$/i, (m) => `Не длиннее ${m[1]} символов`],
  [/^input should be a valid integer.*$/i, () => 'Должно быть целым числом'],
  [/^input should be a valid number.*$/i, () => 'Должно быть числом'],
  [/^input should be greater than (\S+)$/i, (m) => `Должно быть больше ${m[1]}`],
  [/^input should be less than (\S+)$/i, (m) => `Должно быть меньше ${m[1]}`],
  [/^value is not a valid email address.*$/i, () => 'Некорректный e-mail'],
]

function translate(message: string): string {
  const trimmed = message.trim()

  const exact = MESSAGE_DICTIONARY[trimmed.toLowerCase()]
  if (exact) return exact

  for (const [pattern, format] of MESSAGE_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match) return format(match)
  }

  return trimmed
}

type ValidationItem = {
  loc?: unknown
  msg?: unknown
}

/** `["body","password"]` → `password`; служебные префиксы отбрасываем. */
function locationToField(loc: unknown): string {
  if (!Array.isArray(loc)) return ''
  return loc
    .filter(
      (part): part is string | number =>
        typeof part === 'number' ||
        (typeof part === 'string' && !['body', 'query', 'path', 'header'].includes(part)),
    )
    .join('.')
}

function parseValidationDetail(detail: unknown[]): ApiFieldError[] {
  return detail
    .map((item) => {
      const { loc, msg } = (item ?? {}) as ValidationItem
      const field = locationToField(loc)
      const message = typeof msg === 'string' ? translate(msg) : ''
      return field && message ? { field, message } : null
    })
    .filter((item): item is ApiFieldError => item !== null)
}

function messageFromBody(body: unknown): { message: string; fieldErrors: ApiFieldError[] } | null {
  if (typeof body !== 'object' || body === null) return null

  const { detail, message } = body as { detail?: unknown; message?: unknown }

  if (typeof detail === 'string' && detail.trim()) {
    return { message: translate(detail), fieldErrors: [] }
  }

  // FastAPI 422: detail — массив объектов валидации.
  if (Array.isArray(detail)) {
    const fieldErrors = parseValidationDetail(detail)
    return {
      message: fieldErrors[0]?.message ?? STATUS_MESSAGES[422],
      fieldErrors,
    }
  }

  if (typeof message === 'string' && message.trim()) {
    return { message: translate(message), fieldErrors: [] }
  }

  return null
}

/**
 * Приводит что угодно к ApiError: ответ axios, сетевой сбой, обычный Error.
 * Единственная точка, где разбирается формат ошибок бэкенда.
 */
export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (error instanceof AxiosError) {
    const status = error.response?.status ?? null

    if (!error.response) {
      const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
      return new ApiError({
        message: isTimeout
          ? 'Сервер не ответил вовремя'
          : 'Сервер недоступен. Проверьте, запущен ли backend',
        isNetworkError: true,
        payload: error.code,
      })
    }

    const parsed = messageFromBody(error.response.data)
    return new ApiError({
      message:
        parsed?.message ?? STATUS_MESSAGES[status ?? 0] ?? error.message ?? 'Неизвестная ошибка',
      status,
      fieldErrors: parsed?.fieldErrors ?? [],
      payload: error.response.data,
    })
  }

  if (error instanceof Error) {
    return new ApiError({ message: error.message || 'Неизвестная ошибка' })
  }

  return new ApiError({ message: 'Неизвестная ошибка', payload: error })
}

/** Короткий текст ошибки — для мест, где нужна только строка. */
export function getQueryError(error: unknown): string {
  return normalizeApiError(error).message
}
