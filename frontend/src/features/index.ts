/* Диалоги (CompareDialog, SaveVariantDialog, SavedVariantsDialog) намеренно не в барреле:
   страницы грузят их лениво отдельными чанками через прямой путь модуля. */
export { MAX_VARIANTS, MIN_VARIANTS, buildCandidates } from './compare-portfolios'
export type { Candidate, CandidateSource } from './compare-portfolios'
export { useManualSelection, useUniformModeDiagnostics } from './edit-portfolio'
export type { UniformModeDiagnostic } from './edit-portfolio'
export { ExportButton } from './export-calculation'
export { CalculationInputsControl } from './edit-calculation-inputs'
export {
  SearchStats, StressSwitch, defaultVariant, explanationFor, useActiveVariant, useAutoRecommendation,
  useManualRecommendation, usePrefetchRecommendation,
} from './recommend-portfolio'
export type { ActiveVariantKind, ActiveVariantView } from './recommend-portfolio'
