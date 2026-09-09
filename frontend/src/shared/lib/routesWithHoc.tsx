import type { ComponentType, ReactElement } from 'react'

export function routeWithHoc(
  hoc: (component: ComponentType) => ComponentType,
  element: ReactElement,
) {
  const Component = hoc(() => element)
  return <Component />
}
