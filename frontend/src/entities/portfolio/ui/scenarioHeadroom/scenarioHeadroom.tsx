import type { Calculation, Scenario } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Tag } from '@shared/ui'

import { scenarioVerdict } from '../../lib/compare'
import { formatMoney } from '../../lib/format'

type Props = {
  calculation: Calculation
  scenario: Scenario
  className?: string
}

/**
 * Что именно меняет переключатель BASE/STRESS (бриф T1): лимит стартовых
 * затрат, факт, запас или превышение и общий вердикт. Показатели портфеля от
 * сценария не зависят, поэтому без этой строки переключение выглядело бы
 * «ничего не изменилось». Все числа — из `checks[scenario]`, запас считал бэкенд.
 */
export function ScenarioHeadroom({ calculation, scenario, className }: Props) {
  const checks = calculation.checks[scenario]
  const budget = checks?.find((check) => check.code === 'c0_limit')
  const verdict = scenarioVerdict(calculation, scenario)
  if (!checks || !budget) return null

  const slack = budget.slack ?? 0
  const exceeded = !budget.passed
  const failedOthers = verdict.failedCodes.filter((code) => code !== 'c0_limit').length

  const conclusion = verdict.feasible
    ? scenario === 'STRESS'
      ? 'Портфель выдерживает сокращение бюджета без пересмотра состава.'
      : 'Портфель укладывается в базовые пороги.'
    : exceeded
      ? 'Лимит стартовых затрат превышен — нужен пересмотр состава или режимов.'
      : `Лимит выдержан, но нарушено других условий: ${failedOthers}.`

  return (
    <div
      key={scenario}
      className={cn(
        'animate-fade-in rounded-tile bg-sunken/70 px-4 py-3 text-[12.5px] leading-snug text-ink-700',
        className,
      )}
      role="status"
    >
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <Tag tone={verdict.feasible ? 'pass' : 'fail'}>{scenario}</Tag>
        <span>
          лимит стартовых затрат <strong className="tabular-nums">{formatMoney(budget.threshold)}</strong>,
          факт <strong className="tabular-nums">{formatMoney(budget.actual)}</strong> —{' '}
          {exceeded ? (
            <strong className="text-fail tabular-nums">превышение {formatMoney(Math.abs(slack))}</strong>
          ) : (
            <strong className="text-pass tabular-nums">запас {formatMoney(slack)}</strong>
          )}
          . {conclusion}
        </span>
      </p>
      <p className="mt-1 text-[11.5px] text-muted">
        Показатели портфеля от сценария не зависят: переключатель меняет только пороги проверки —
        состав, режимы и цены лотов те же.
      </p>
    </div>
  )
}
