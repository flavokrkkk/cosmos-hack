import { createBrowserRouter } from 'react-router-dom'

import { ERouteNames } from '@shared/lib/routeVariables'

import DashboardPage from './(main)/dashboardPage'
import ErrorPage from './(main)/errorPage'

export const routes = createBrowserRouter([
  {
    path: ERouteNames.DEFAULT_ROUTE,
    element: <DashboardPage />,
    errorElement: <ErrorPage />,
  },
])
