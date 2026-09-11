import { useQuery } from '@tanstack/react-query'

import { caseService } from '../api'

export const caseKeys = {
  catalog: ['case', 'catalog'] as const,
}

/**
 * Каталог неизменен в рамках версии данных, поэтому кешируется без протухания.
 * `dataset_hash` из ответа обязателен во всех последующих запросах.
 */
export function useCatalog() {
  return useQuery({
    queryKey: caseKeys.catalog,
    queryFn: caseService.getCatalog,
    staleTime: Infinity,
    meta: { errorMessage: 'Не удалось загрузить каталог лотов' },
  })
}
