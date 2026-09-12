import { lazy } from 'react'

/**
 * Диалоги грузятся отдельными чанками при первом открытии: в первой отрисовке
 * их код не нужен, а сравнение с AI-анализом — самый тяжёлый модуль страницы.
 */
export const LazyCompareDialog = lazy(() =>
  import('@features/compare-portfolios/ui/compareDialog').then((module) => ({ default: module.CompareDialog })),
)

export const LazySaveVariantDialog = lazy(() =>
  import('@features/save-variant/ui/saveVariantDialog').then((module) => ({ default: module.SaveVariantDialog })),
)

export const LazySavedVariantsDialog = lazy(() =>
  import('@features/save-variant/ui/savedVariantsDialog').then((module) => ({ default: module.SavedVariantsDialog })),
)
