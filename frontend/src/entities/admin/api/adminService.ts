import { axiosAuth, axiosNoAuth } from '@shared/api/baseQueryInstance'

import type {
  CurrentUserResponse,
  LoginDto,
  LoginResponse,
  RefreshTokenDto,
} from '../types'

class AdminService {
  login(data: LoginDto): Promise<LoginResponse> {
    return axiosNoAuth.post('/admin/auth/login', data)
  }

  getCurrentUser(): Promise<CurrentUserResponse> {
    return axiosAuth.get('/admin/auth/current_user')
  }

  refreshToken(data: RefreshTokenDto): Promise<LoginResponse> {
    return axiosNoAuth.post('/admin/auth/refresh', data)
  }
}

export const adminService = new AdminService()
