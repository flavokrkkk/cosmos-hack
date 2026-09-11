import { ViewerProvider } from '@entities/viewer/model'
import { routes } from '@pages/routes'
import { queryClient } from '@shared/api'
import { AppToaster } from '@shared/ui'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

export function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <ViewerProvider>
        <RouterProvider router={routes} />
      </ViewerProvider>
      <AppToaster />
    </QueryClientProvider>
  )
}
