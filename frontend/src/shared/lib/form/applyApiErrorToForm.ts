import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

import { normalizeApiError } from '@shared/api/apiError'

/**
 * Раскладывает ошибки валидации бэкенда (FastAPI 422) по полям формы.
 *
 * Возвращает true, если хотя бы одна ошибка легла на существующее поле. Если
 * вернулся false — ошибка общая (401, 500, сеть), её показывает глобальный тост,
 * и дублировать её в форме не нужно.
 */
export function applyApiErrorToForm<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly Path<T>[],
): boolean {
  const { fieldErrors } = normalizeApiError(error)
  let applied = false

  for (const fieldError of fieldErrors) {
    const field = fieldError.field as Path<T>
    if (!knownFields.includes(field)) continue
    setError(field, { type: 'server', message: fieldError.message })
    applied = true
  }

  return applied
}
