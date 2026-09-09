import { useMutation } from '@tanstack/react-query'

import { adminService } from '../api'

export function useRefreshToken() {
  return useMutation({
    mutationFn: adminService.refreshToken.bind(adminService),
  })
}
