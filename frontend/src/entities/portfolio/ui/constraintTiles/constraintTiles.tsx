import type { ConstraintCheck } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { StatTile, Tooltip } from '@shared/ui'

import { checkLabel, formatCheckValue, formatSlack } from '../../lib/format'

type Props = {
  checks: ConstraintCheck[]
  /** Коды условий, чей порог отличается между BASE и STRESS, — подписываются на плитке. */
  scenarioDependent?: ReadonlySet<string>
  scenario?: string
  className?: string
}

/**
 * Девять проверок плитками «факт / порог». Нарушение — красная плитка И слово
 * «нарушено» в подсказке: статус не строится на одном цвете.
 */
export function ConstraintTiles({ checks, scenarioDependent, scenario, className }: Props) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', className)}>
      {checks.map((check) => (
        <Tooltip
          key={check.code}
          content={
            <span>
              <span className="font-semibold">{check.title}</span>
              <span className="block text-white/75">
                {check.passed ? 'выполнено' : 'нарушено'} · запас {formatSlack(check.slack)}
                {check.unit && check.unit !== '—' ? ` ${check.unit}` : ''}
              </span>
            </span>
          }
        >
          <div tabIndex={0} className="rounded-tile">
            <StatTile
              label={checkLabel(check)}
              value={formatCheckValue(check)}
              hint={scenarioDependent?.has(check.code) ? `порог сценария ${scenario ?? ''}`.trim() : undefined}
              tone={check.passed ? 'neutral' : 'fail'}
            />
          </div>
        </Tooltip>
      ))}
    </div>
  )
}
