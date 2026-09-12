import type { Calculation, Scenario } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Tag, Tooltip } from '@shared/ui'

import { scenarioVerdict } from '../../lib/compare'
import { formatMoney } from '../../lib/format'

type Props = {
  calculation: Calculation
  scenario: Scenario
  /** Открыт портфель команды: в STRESS добавляется ответ команды на стресс (бриф T2). */
  isTeam?: boolean
  className?: string
}

/**
 * Что именно меняет переключатель BASE/STRESS (бриф T1): лимит стартовых
 * затрат, факт, запас или превышение и вердикт — одной строкой. Показатели
 * портфеля от сценария не зависят, поэтому без этой строки переключение
 * выглядело бы «ничего не изменилось». Числа — из `checks[scenario]`.
 */
export function ScenarioHeadroom({ calculation, scenario, isTeam = false, className }: Props) {
  const checks = calculation.checks[scenario]
  const budget = checks?.find((check) => check.code === 'c0_limit')
  const verdict = scenarioVerdict(calculation, scenario)
  if (!checks || !budget) return null

  const slack = budget.slack ?? 0
  const exceeded = !budget.passed
  const failedOthers = verdict.failedCodes.filter((code) => code !== 'c0_limit').length

  const conclusion = verdict.feasible
    ? scenario === 'STRESS'
      ? 'выдерживает сокращение бюджета'
      : 'укладывается в базовые пороги'
    : exceeded
      ? 'лимит превышен — нужен пересмотр'
      : `нарушено других условий: ${failedOthers}`

  return (
    <div
      key={scenario}
      className={cn(
        'animate-fade-in flex flex-wrap items-center gap-x-2 gap-y-1 rounded-tile bg-sunken/70 px-4 py-2.5 text-[12.5px] leading-snug text-ink-700',
        className,
      )}
      role="status"
    >
      <Tooltip content="Сценарий меняет только пороги проверки: состав, режимы и показатели портфеля те же.">
        <Tag tone={verdict.feasible ? 'pass' : 'fail'} tabIndex={0} className="cursor-help">{scenario}</Tag>
      </Tooltip>
      <span className="tabular-nums">
        лимит C0 <strong>{formatMoney(budget.threshold)}</strong> · факт <strong>{formatMoney(budget.actual)}</strong> ·{' '}
        {exceeded ? (
          <strong className="text-fail">превышение {formatMoney(Math.abs(slack))}</strong>
        ) : (
          <strong className="text-pass">запас {formatMoney(slack)}</strong>
        )}
      </span>
      <span className="text-muted">— {conclusion}</span>
      {isTeam && scenario === 'STRESS' && verdict.feasible ? (
        <span className="text-muted">· решение команды: портфель сохраняется без пересмотра</span>
      ) : null}
    </div>
  )
}
