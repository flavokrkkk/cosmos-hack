import type { RecommendationResult } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'

import { formatNumber } from '@entities/portfolio'

type Props = {
  result: RecommendationResult
  className?: string
}

/** Счётчики перебора: единственное, что движок сообщает об отсеве. */
export function SearchStats({ result, className }: Props) {
  const items = [
    { label: 'рассмотрено', value: result.considered_count },
    { label: 'проходят BASE', value: result.base_count },
    { label: 'проходят STRESS', value: result.stress_count },
    { label: 'допустимых для подбора', value: result.feasible_count },
    { label: 'недоминируемых', value: result.pareto_count },
  ]
  return (
    <dl className={cn('flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[13px] text-muted', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-1.5">
          <dd className="font-semibold text-ink tabular-nums">{formatNumber(item.value)}</dd>
          <dt>{item.label}</dt>
        </div>
      ))}
    </dl>
  )
}
