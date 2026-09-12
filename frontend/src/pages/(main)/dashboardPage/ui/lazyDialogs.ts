import { lazy } from 'react'

/**
 * Диалоги грузятся отдельными чанками при первом открытии: в первой отрисовке
 * их код не нужен, а сравнение с AI-анализом — самый тяжёлый модуль страницы.
 */
const loadCompareDialog = () => import('@features/compare-portfolios/ui/compareDialog')
const loadSaveVariantDialog = () => import('@features/save-variant/ui/saveVariantDialog')

export const LazyCompareDialog = lazy(() =>
  loadCompareDialog().then((module) => ({ default: module.CompareDialog })),
)

export const LazySaveVariantDialog = lazy(() =>
  loadSaveVariantDialog().then((module) => ({ default: module.SaveVariantDialog })),
)

/** Подгрузить чанки диалогов заранее — по наведению на кнопки действий. */
export function preloadActionDialogs() {
  void loadCompareDialog()
  void loadSaveVariantDialog()
}

export const LazySavedVariantsDialog = lazy(() =>
  import('@features/save-variant/ui/savedVariantsDialog').then((module) => ({ default: module.SavedVariantsDialog })),
)
