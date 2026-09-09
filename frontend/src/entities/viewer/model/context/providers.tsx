import type { PropsWithChildren } from 'react'

import { useGetCurrentUser } from '@entities/admin/hooks'

import { ViewerContext } from './viewerContext'
import type { ViewerContextValue } from './types'

export function ViewerProvider({ children }: PropsWithChildren) {
  const currentUser = useGetCurrentUser()
  const value: ViewerContextValue = {
    currentUser: currentUser.data ?? null,
    isAuthenticated: Boolean(currentUser.data),
    isLoading: currentUser.isLoading,
  }

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
}
