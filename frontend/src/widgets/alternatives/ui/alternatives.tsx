import {
  Coins, Flag, Maximize2, Scale, Shuffle, Sprout, TrendingUp, type LucideIcon,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

import { formatMoney, formatNumber, selectionLabel, useWorkspace } from '@entities/portfolio'
import { VariantExplanation } from '@features/explain-portfolio'
import type { RecommendationResult, RecommendationVariant } from '@shared/api/contracts'
import { SCENARIOS } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Button, Card, SectionHeading, Tag } from '@shared/ui'

/** `team` — портфель команды (`recommended`), число — индекс опорной точки. */
export type AlternativeTarget = 'team' | number

type Props = {
  title: ReactNode
  subtitle?: ReactNode
  result: RecommendationResult
  /** Что открыто сейчас: портфель команды, индекс опорной точки или ничего из списка. */
  active: AlternativeTarget | null
  onOpen: (target: AlternativeTarget) => void
  className?: string
}

const TILTS = [-1.5, 0, 1.5, -1, 1]

/** Иконка по смыслу заголовка опорной точки; для неизвестной — «перестановка». */
function iconFor(title: string, isTeam: boolean): LucideIcon {
  if (isTeam) return Flag
  const text = title.toLowerCase()
  if (text.includes('обществен') || text.includes('ценност')) return Scale
  if (text.includes('затрат') || text.includes('дешев') || text.includes('эконом')) return Coins
  if (text.includes('покрыт') || text.includes('kcash')) return TrendingUp
  if (text.includes('тираж')) return Sprout
  if (text.includes('разнообраз')) return Maximize2
  return Shuffle
}

/**
 * «Альтернативы и сравнение»: портфель команды и опорные точки фронта —
 * крайние значения по каждому показателю среди недоминируемых вариантов.
 * Это границы возможного, а не то, что следует выбрать. «Открыть этот вариант»
 * меняет просмотр, но НЕ принимает вариант решением команды.
 */
export function Alternatives({ title, subtitle, result, active, onOpen, className }: Props) {
  const scenario = useWorkspace((state) => state.scenario)
  const items: { target: AlternativeTarget; variant: RecommendationVariant }[] = [
    ...(result.recommended ? [{ target: 'team' as const, variant: result.recommended }] : []),
    ...result.alternatives.map((variant, index) => ({ target: index, variant })),
  ]
  if (items.length === 0) return null

  return (
    <section className={cn('flex flex-col items-center gap-8', className)}>
      <SectionHeading title={title} description={subtitle} />

      <ul className="flex w-full flex-wrap justify-center gap-6">
        {items.map(({ target, variant }, index) => {
          const isTeam = target === 'team'
          const isActive = active === target
          const Icon = iconFor(variant.title, isTeam)
          const feasible = variant.calculation.feasible_by_scenario
          const metrics = variant.calculation.metrics
          const budget = variant.calculation.checks[scenario]?.find((check) => check.code === 'c0_limit')
          return (
            <li key={variant.calculation.input_hash} className="flex w-full sm:w-[calc(50%-12px)] lg:w-[262px]">
              <Card
                style={{ '--tilt': `${TILTS[index % TILTS.length]}deg` } as CSSProperties}
                className={cn(
                  'flex w-full flex-col p-[22px] transition-[rotate,box-shadow] duration-300 ease-(--ease-soft)',
                  'lg:rotate-(--tilt) lg:hover:rotate-0 lg:hover:shadow-card-hover',
                  isActive && 'ring-2 ring-brand/25',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <Icon className="size-7 text-brand" aria-hidden strokeWidth={2} />
                  {isTeam ? <Tag tone="brand">выбран командой</Tag> : <Tag tone="muted">опорная точка</Tag>}
                </div>
                <h3 className="mt-7 text-[17px] leading-tight font-bold tracking-[-0.01em]">{variant.title}</h3>
                <p className="mt-1.5 line-clamp-4 text-[13px] leading-snug text-muted" title={variant.reason}>
                  {variant.reason}
                </p>
                <p className="mt-3 text-[12px] text-ink-500 tabular-nums">
                  {selectionLabel(variant.calculation.selection)}
                </p>
                <div className="mt-2 flex gap-1.5">
                  {SCENARIOS.map((scenario) => (
                    <Tag key={scenario} tone={feasible[scenario] ? 'pass' : 'fail'}>
                      {scenario} {feasible[scenario] ? 'проходит' : 'не проходит'}
                    </Tag>
                  ))}
                </div>
                {metrics ? (
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px] tabular-nums">
                    <div><dt className="text-muted">C0</dt><dd>{formatMoney(metrics.c0_mrub)}</dd></div>
                    <div><dt className="text-muted">VPUB / год</dt><dd>{formatMoney(metrics.vpub_mrub_per_year)}</dd></div>
                    <div><dt className="text-muted">KCASH</dt><dd>{formatNumber(metrics.kcash)}</dd></div>
                    {budget?.slack != null ? (
                      <div><dt className="text-muted">Запас · {scenario}</dt><dd className={budget.passed ? 'text-pass' : 'text-fail'}>{formatMoney(budget.slack)}</dd></div>
                    ) : null}
                  </dl>
                ) : null}
                <VariantExplanation result={variant.explanation} />
                <div className="mt-auto pt-5">
                  <Button
                    size="md"
                    variant={isActive ? 'secondary' : 'primary'}
                    className="w-full"
                    onClick={() => onOpen(target)}
                    disabled={isActive}
                  >
                    {isActive ? 'Открыт сейчас' : 'Открыть этот вариант'}
                  </Button>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
