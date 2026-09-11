import type { ComponentType } from 'react'
import { Navigate } from 'react-router-dom'

import { ERouteNames } from '@shared/lib/routeVariables'

import { useViewer } from '../../model'

export function privatePage(Component: ComponentType) {
  return function PrivatePage() {
    const viewer = useViewer()
    if (viewer.isLoading) return <p>Загрузка…</p>
    if (!viewer.isAuthenticated) return <Navigate replace to={ERouteNames.LOGIN_ROUTE} />
    return <Component />
  }
}
