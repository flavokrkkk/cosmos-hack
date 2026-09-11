import { useMutation } from '@tanstack/react-query'

import { setAccessToken, setRefreshToken } from '@shared/lib/token'

import { sessionService } from '../api'
import type { LoginDto, LoginResponse } from '../types'

export function useLogin() {
  return useMutation<LoginResponse, Error, LoginDto>({
    mutationFn: sessionService.login.bind(sessionService),
    onSuccess: (tokens) => {
      setAccessToken(tokens.access_token)
      setRefreshToken(tokens.refresh_token)
    },
    // Ошибки показывает сама форма: валидацию — под полями, остальное — тостом.
    // Без этого ошибка поля дублировалась бы ещё и глобальным тостом.
    meta: { skipErrorToast: true },
  })
}
