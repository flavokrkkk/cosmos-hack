import { axiosAuth, axiosNoAuth } from '@shared/api'

import type { CurrentUserResponse, LoginDto, LoginResponse } from '../types'

// Бэкенд-маршруты авторизации зафиксированы в AGENTS.md как начальный контракт API
// (/admin/auth/*). Фронтенд-сущность нейтральная — session, но URL остаются прежними.
class SessionService {
  login(data: LoginDto): Promise<LoginResponse> {
    return axiosNoAuth.post('/admin/auth/login', data)
  }

  getCurrentUser(): Promise<CurrentUserResponse> {
    return axiosAuth.get('/admin/auth/current_user')
  }
}

export const sessionService = new SessionService()
