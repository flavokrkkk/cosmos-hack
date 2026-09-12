import type { ConstraintCheck } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { StatTile, Tooltip } from '@shared/ui'

import { checkLabel, formatCheckValue, formatCompact, formatSlack } from '../../lib/format'

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
    <div className={cn('grid auto-rows-fr grid-cols-2 items-stretch gap-2 sm:grid-cols-3', className)}>
      {checks.map((check) => (
        <Tooltip
          /* Ключ со сценарием: сменился порог — плитка перемонтируется и подсвечивается. */
          key={scenarioDependent?.has(check.code) ? `${check.code}:${scenario}` : check.code}
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
          <div tabIndex={0} className={cn('h-full rounded-tile', scenarioDependent?.has(check.code) && 'animate-highlight')}>
            <StatTile
              label={checkLabel(check)}
              value={formatCheckValue(check)}
              hint={
                scenarioDependent?.has(check.code)
                  ? `${scenario ?? ''} · ${check.slack !== null && check.slack < 0 ? 'превышение' : 'запас'} ${formatCompact(Math.abs(check.slack ?? 0))}`.trim()
                  : undefined
              }
              tone={check.passed ? 'neutral' : 'fail'}
              className="h-full"
            />
          </div>
        </Tooltip>
      ))}
    </div>
  )
}
