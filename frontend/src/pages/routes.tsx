import { createBrowserRouter } from 'react-router-dom'

import { privatePage, publicPage } from '@entities/viewer/lib'
import { ERouteNames } from '@shared/lib/routeVariables'

import AuthPage from './(auth)/authPage'
import LoginPage from './(auth)/loginPage'
import DashboardPage from './(main)/dashboardPage'
import ErrorPage from './(main)/errorPage'
import RootPage from './(main)/rootPage'

const ProtectedDashboardPage = privatePage(DashboardPage)
const PublicLoginPage = publicPage(LoginPage)

export const routes = createBrowserRouter([
  {
    path: ERouteNames.DEFAULT_ROUTE,
    element: <RootPage />,
    errorElement: <ErrorPage />,
    children: [{ index: true, element: <ProtectedDashboardPage /> }],
  },
  {
    path: ERouteNames.LOGIN_ROUTE,
    element: <AuthPage />,
    errorElement: <ErrorPage />,
    children: [{ index: true, element: <PublicLoginPage /> }],
  },
])
