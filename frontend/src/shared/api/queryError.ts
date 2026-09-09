export function getQueryError(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}
