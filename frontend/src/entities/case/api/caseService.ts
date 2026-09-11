import { apiClient } from '@shared/api'
import type { CaseCatalog } from '@shared/api/contracts'

/** Официальный каталог кейса: восемь лотов, режимы, ограничения, версия данных. */
export const caseService = {
  getCatalog: () => apiClient.get<CaseCatalog>('/portfolio/catalog'),
}
