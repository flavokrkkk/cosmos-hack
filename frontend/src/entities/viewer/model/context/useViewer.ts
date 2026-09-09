import { useContext } from 'react'

import { ViewerContext } from './viewerContext'

export function useViewer() {
  const context = useContext(ViewerContext)
  if (!context) {
    throw new Error('useViewer must be used inside ViewerProvider')
  }
  return context
}
