import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '@entities/token'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

type ApiErrorBody = {
  detail?: string
  message?: string
}

type TokenPair = {
  access_token: string
  refresh_token: string
  token_type: string
}

class AxiosClient {
  private readonly instance: AxiosInstance
  private refreshPromise: Promise<TokenPair> | null = null

  constructor(withAuth = false) {
    this.instance = axios.create({
      baseURL: apiUrl,
      headers: { 'Content-Type': 'application/json' },
    })

    if (withAuth) {
      this.addAuthInterceptors()
    }
  }

  private addAuthInterceptors() {
    this.instance.interceptors.request.use((config) => {
      const token = getAccessToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      if (config.data instanceof FormData) {
        delete config.headers['Content-Type']
      }
      return config
    })

    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiErrorBody>) => {
        const request = error.config as
          | (AxiosRequestConfig & { _retry?: boolean })
          | undefined
        const refreshToken = getRefreshToken()

        if (error.response?.status === 401 && request && !request._retry && refreshToken) {
          request._retry = true
          this.refreshPromise ??= axios
            .post<TokenPair>(`${apiUrl}/admin/auth/refresh`, {
              refresh_token: refreshToken,
            })
            .then(({ data }) => data)
            .finally(() => {
              this.refreshPromise = null
            })

          try {
            const tokens = await this.refreshPromise
            setAccessToken(tokens.access_token)
            setRefreshToken(tokens.refresh_token)
            return this.instance(request)
          } catch {
            clearTokens()
          }
        }

        return Promise.reject(error)
      },
    )
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.unwrap(this.instance.get<T>(url, config))
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.unwrap(this.instance.post<T>(url, data, config))
  }

  private async unwrap<T>(request: Promise<AxiosResponse<T>>): Promise<T> {
    try {
      return (await request).data
    } catch (error) {
      const apiError = error as AxiosError<ApiErrorBody>
      throw new Error(
        apiError.response?.data.detail ??
          apiError.response?.data.message ??
          apiError.message,
      )
    }
  }
}

export const axiosNoAuth = new AxiosClient()
export const axiosAuth = new AxiosClient(true)
