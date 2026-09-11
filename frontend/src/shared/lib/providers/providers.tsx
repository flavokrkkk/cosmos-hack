import { routes } from '@pages/routes'
import { persistOptions, queryClient } from '@shared/api'
import { AppToaster, TooltipProvider } from '@shared/ui'
import { QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import type { ReactNode } from 'react'
import { RouterProvider } from 'react-router-dom'

/** Кеш восстанавливается из sessionStorage, если хранилище доступно. */
function QueryProvider({ children }: { children: ReactNode }) {
  if (persistOptions) {
    return (
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        {children}
      </PersistQueryClientProvider>
    )
  }
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

export function Providers() {
  return (
    <QueryProvider>
      <TooltipProvider delayDuration={250} skipDelayDuration={400}>
        <RouterProvider router={routes} />
      </TooltipProvider>
      <AppToaster />
    </QueryProvider>
  )
}
