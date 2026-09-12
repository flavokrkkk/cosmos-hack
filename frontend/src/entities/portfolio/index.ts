export { portfolioService } from './api'
export {
  evaluateQueryOptions, portfolioKeys, recommendationQueryOptions, useCompare, useComparisonAnalysis,
  useEvaluate, useRecommendation, useRecommendationExplanations,
} from './hooks'
export type { RecommendParams } from './hooks'
export {
  DELTA_ROWS, DELTA_VERDICT_LABEL, EXTRA_METRIC_TILES, METRIC_TILES, METRIC_TILES_COMPACT,
  MAX_CANDIDATE_LOTS, PORTFOLIO_SIZE, analysisJson, checkLabel, comparisonValue, decisionJson, deltaVerdict, detailCsv,
  formatCheckValue, formatCompact, formatDelta, formatMoney, formatMoneyPerYear, formatNumber, formatSlack,
  formatThreshold, lotIdsKey, metricsJson, scenarioDependentCodes, scenarioVerdict, selectionKey, selectionLabel,
  snapshotFiles, sortedLotIds,
} from './lib'
export type { DeltaKey, DeltaVerdict, ExportFile, MetricTileDefinition, ScenarioVerdict } from './lib'
export {
  calculationInputsKey, changedInputCount, cloneCalculationInputs, effectiveCatalog,
  officialCalculationInputs, useComparison, useSavedVariants, useWorkspace,
} from './model'
export type { ActiveVariant, ManualOrigin, SavedSource, SavedVariant, WorkspaceMode } from './model'
export {
  ConstraintTiles, ExtraMetrics, FeasibilityBadge, FinancialBreakdown, LotChip, MetricTiles, PortfolioLotCard,
  PortfolioProgress,
} from './ui'
