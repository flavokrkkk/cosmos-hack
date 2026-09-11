import { useQuery } from '@tanstack/react-query'

import { caseService } from '../api'

export const caseKeys = {
  catalog: ['case', 'catalog'] as const,
}

/**
 * Каталог неизменен в рамках версии данных. Кеш переживает перезагрузку вкладки,
 * поэтому раз в несколько минут его всё же перепроверяем: если бэкенд перезапущен
 * с другими данными, страница должна узнать новый `dataset_hash`, а не считать
 * по старому — бэкенд ответит 409 на любой расчёт.
 */
export function useCatalog() {
  return useQuery({
    queryKey: caseKeys.catalog,
    queryFn: caseService.getCatalog,
    staleTime: 5 * 60_000,
    meta: { errorMessage: 'Не удалось загрузить каталог лотов' },
  })
}
