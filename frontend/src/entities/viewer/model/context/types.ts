import type { CurrentUserResponse } from '@entities/admin/types'

export type ViewerContextValue = {
  currentUser: CurrentUserResponse | null
  isAuthenticated: boolean
  isLoading: boolean
}
