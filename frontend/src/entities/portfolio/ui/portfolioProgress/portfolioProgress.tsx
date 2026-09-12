import type { Calculation, Scenario } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { StatTile, Tag } from '@shared/ui'

import { checkLabel, formatCompact, formatThreshold } from '../../lib/format'

type Props = {
  /** Неполный расчёт (1–3 лота) с техническим режимом-заглушкой. */
  calculation: Calculation
  scenario: Scenario
  className?: string
}

/**
 * Условия, которые не зависят от режима доступа: они определяются только
 * набором лотов, поэтому их можно показывать до того, как сервер назначит A/B/C.
 * Деньги, покрытие расходов и общественное ядро от режима зависят — их здесь нет.
 */
const STRUCTURAL_CODES = ['exact_lot_count', 'territorial_archetypes', 'capability_groups'] as const

/**
 * Прогресс сборки портфеля при 1–3 лотах.
 *
 * Показывает «что уже набрано» по структурным условиям кейса: сколько лотов,
 * территориальных архетипов и групп возможностей. Это подсказка, чего не
 * хватает до допустимого набора, а не проверка портфеля: недобор подписан
 * «пока не набрано», а не «нарушено» (план §13.5). Числа — из ответа бэкенда;
 * режим-заглушка в запросе на эти счётчики не влияет.
 */
export function PortfolioProgress({ calculation, scenario, className }: Props) {
  const checks = calculation.checks[scenario] ?? []
  const structural = STRUCTURAL_CODES
    .map((code) => checks.find((check) => check.code === code))
    .filter((check): check is NonNullable<typeof check> => Boolean(check))
  const capabilitySet = calculation.metrics?.capability_set ?? []

  if (structural.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="grid grid-cols-3 gap-3">
        {structural.map((check) => {
          const reached = check.passed
          return (
            <StatTile
              key={check.code}
              label={checkLabel(check)}
              value={`${formatCompact(check.actual)} / ${formatThreshold(check)}`}
              hint={reached ? 'набрано' : 'пока не набрано'}
              tone={reached ? 'pass' : 'muted'}
            />
          )
        })}
      </div>
      {capabilitySet.length > 0 ? (
        <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          Группы возможностей:
          {capabilitySet.map((group) => (
            <Tag key={group} tone="muted">{group}</Tag>
          ))}
        </p>
      ) : null}
    </div>
  )
}
