import { useMutation } from '@tanstack/react-query'

import { setAccessToken, setRefreshToken } from '@entities/token'

import { adminService } from '../api'
import type { LoginDto, LoginResponse } from '../types'

export function useAdminLogin() {
  return useMutation<LoginResponse, Error, LoginDto>({
    mutationFn: adminService.login.bind(adminService),
    onSuccess: (tokens) => {
      setAccessToken(tokens.access_token)
      setRefreshToken(tokens.refresh_token)
    },
  })
}
