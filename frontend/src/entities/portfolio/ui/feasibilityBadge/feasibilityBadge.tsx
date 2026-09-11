import type { Calculation, Scenario } from '@shared/api/contracts'
import { Tag } from '@shared/ui'

import { scenarioVerdict } from '../../lib/compare'

type Props = {
  calculation: Calculation
  scenario: Scenario
  size?: 'sm' | 'md'
}

/** «Все 9 ограничений выполнены» / «Нарушено 2 из 9» — словом, не только цветом. */
export function FeasibilityBadge({ calculation, scenario, size = 'md' }: Props) {
  const verdict = scenarioVerdict(calculation, scenario)
  const failed = verdict.total - verdict.passed
  if (verdict.feasible) {
    return <Tag tone="pass" size={size}>Все {verdict.total} ограничений выполнены</Tag>
  }
  return (
    <Tag tone="fail" size={size}>
      Нарушено {failed} из {verdict.total}
    </Tag>
  )
}
