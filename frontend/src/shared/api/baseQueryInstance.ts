import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'

import { normalizeApiError } from './apiError'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/**
 * Один HTTP-клиент на всё приложение.
 *
 * Авторизации нет: портфельные маршруты бэкенда открыты, и по условиям кейса
 * эксперт должен запускать решение без логина и личных ключей (README §14,
 * сценарий 5 «Доступ без авторов»).
 */
class AxiosClient {
  private readonly instance: AxiosInstance

  constructor() {
    this.instance = axios.create({
      baseURL: apiUrl,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.unwrap(this.instance.get<T>(url, config))
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.unwrap(this.instance.post<T>(url, data, config))
  }

  /**
   * Любая ошибка сети или бэкенда приводится к ApiError. Раньше здесь был
   * `new Error(detail)`, из-за чего массив ошибок валидации FastAPI (422)
   * превращался в «[object Object]».
   */
  private async unwrap<T>(request: Promise<AxiosResponse<T>>): Promise<T> {
    try {
      return (await request).data
    } catch (error) {
      throw normalizeApiError(error)
    }
  }
}

export const apiClient = new AxiosClient()
