import { createContext } from 'react'

import type { ViewerContextValue } from './types'

export const ViewerContext = createContext<ViewerContextValue | null>(null)
