import type { PropsWithChildren } from 'react'

import { useCurrentUser } from '@entities/session'

import { ViewerContext } from './viewerContext'
import type { ViewerContextValue } from './types'

export function ViewerProvider({ children }: PropsWithChildren) {
  const currentUser = useCurrentUser()
  const value: ViewerContextValue = {
    currentUser: currentUser.data ?? null,
    isAuthenticated: Boolean(currentUser.data),
    isLoading: currentUser.isLoading,
  }

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
}
