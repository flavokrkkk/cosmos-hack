import { ELocalStorageKeys } from '@shared/lib/storageKeys'

export const setAccessToken = (token: string) =>
  localStorage.setItem(ELocalStorageKeys.ACCESS_TOKEN_KEY, token)

export const getAccessToken = () =>
  localStorage.getItem(ELocalStorageKeys.ACCESS_TOKEN_KEY)

export const deleteAccessToken = () =>
  localStorage.removeItem(ELocalStorageKeys.ACCESS_TOKEN_KEY)

export const setRefreshToken = (token: string) =>
  localStorage.setItem(ELocalStorageKeys.REFRESH_TOKEN_KEY, token)

export const getRefreshToken = () =>
  localStorage.getItem(ELocalStorageKeys.REFRESH_TOKEN_KEY)

export const deleteRefreshToken = () =>
  localStorage.removeItem(ELocalStorageKeys.REFRESH_TOKEN_KEY)

export const clearTokens = () => {
  deleteAccessToken()
  deleteRefreshToken()
}
