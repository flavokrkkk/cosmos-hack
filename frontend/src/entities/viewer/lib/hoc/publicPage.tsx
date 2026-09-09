import type { ComponentType } from 'react'
import { Navigate } from 'react-router-dom'

import { useViewer } from '../../model'

export function publicPage(Component: ComponentType) {
  return function PublicPage() {
    const viewer = useViewer()
    if (viewer.isLoading) return <p>Загрузка…</p>
    if (viewer.isAuthenticated) return <Navigate replace to="/" />
    return <Component />
  }
}
