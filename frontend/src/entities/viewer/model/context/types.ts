import type { CurrentUserResponse } from '@entities/session'

export type ViewerContextValue = {
  currentUser: CurrentUserResponse | null
  isAuthenticated: boolean
  isLoading: boolean
}
