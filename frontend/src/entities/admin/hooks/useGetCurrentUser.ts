import { useQuery } from '@tanstack/react-query'

import { getAccessToken } from '@entities/token'

import { adminService } from '../api'

export function useGetCurrentUser() {
  return useQuery({
    queryKey: ['admin', 'current-user'],
    queryFn: adminService.getCurrentUser.bind(adminService),
    enabled: Boolean(getAccessToken()),
    retry: false,
  })
}
