import type { RecommendationExplanation, RecommendationResult } from '@shared/api/contracts'

/**
 * Объяснение варианта из ответа второго шага подбора — по `input_hash` расчёта.
 * Первый шаг объяснений не содержит, поэтому искать нужно именно в ответе
 * с `with_explanations: true`.
 */
export function explanationFor(
  result: RecommendationResult | undefined,
  inputHash: string | undefined,
): RecommendationExplanation | null {
  if (!result || !inputHash) return null
  const variants = [result.recommended, ...result.alternatives]
  return variants.find((variant) => variant?.calculation.input_hash === inputHash)?.explanation ?? null
}
