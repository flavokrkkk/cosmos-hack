import { useQuery } from '@tanstack/react-query'

import { getAccessToken } from '@shared/lib/token'

import { sessionService } from '../api'

export function useCurrentUser() {
  return useQuery({
    queryKey: ['session', 'current-user'],
    queryFn: sessionService.getCurrentUser.bind(sessionService),
    enabled: Boolean(getAccessToken()),
    retry: false,
    // Протухший токен — штатная ситуация: гвард уводит на страницу входа,
    // тост об ошибке тут только мешал бы.
    meta: { skipErrorToast: true },
  })
}
