import { formatMoney, formatNumber, selectionLabel } from '@entities/portfolio'
import type {
  DecisionAnalysis as Analysis, ScoreComponent, SensitivityCase,
} from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Collapsible, Panel, PanelHeader, PanelTitle, StatTile, Tag, Tile } from '@shared/ui'

type Props = {
  analysis: Analysis | null | undefined
  className?: string
}

function money(value: number | null): string {
  return value === null ? '—' : formatMoney(value)
}

/**
 * «Почему выбран этот портфель» — стадии правила выбора (S_max → Δ → Q),
 * шесть оценок победителя, точки смены победителя по Δ и чувствительность к
 * допущениям. Всё приходит в `analysis` с сервера; в браузере ничего не
 * считается и не ранжируется.
 */
export function DecisionAnalysis({ analysis, className }: Props) {
  if (!analysis?.winner) return null
  const { winner } = analysis
  const bottleneck = winner.components.find((item) => item.bottleneck)
  const changed = analysis.sensitivity.filter((item) => item.outcome.winner_changed).length
  const manualDelta = analysis.cash_loss_limit_mrub !== null

  return (
    <Panel className={cn('w-full', className)}>
      <PanelHeader className="items-start">
        <div>
          <PanelTitle>Почему выбран этот портфель</PanelTitle>
          <p className="mt-1 text-[12.5px] text-muted">
            {selectionLabel(winner.selection)} · шкалы по {analysis.reference_count} допустимым вариантам,
            до дополнительных условий
          </p>
        </div>
        <Tag tone="brand" size="md" className="tabular-nums">Q = {formatNumber(winner.q, 3)}</Tag>
      </PanelHeader>

      <div className="grid auto-rows-fr grid-cols-2 items-stretch gap-2 lg:grid-cols-4">
        <StatTile
          label="Максимум остатка S в области поиска"
          value={money(analysis.s_max_mrub)}
          hint="в год"
          className="h-full"
        />
        <StatTile
          label={`Допустимая потеря Δ · ${manualDelta ? 'задана вручную' : 'автоматически'}`}
          value={money(analysis.effective_delta_mrub)}
          hint={`порог S ≥ ${money(analysis.cash_floor_mrub)}`}
          className="h-full"
        />
        <StatTile
          label="Прошли денежное ограничение"
          value={String(analysis.cash_eligible_count)}
          hint={`из ${analysis.reference_count} вариантов`}
          className="h-full"
        />
        <StatTile
          label="Лучшая слабая оценка Q"
          value={formatNumber(winner.q, 3)}
          hint={bottleneck ? `узкое место — ${bottleneck.title.toLowerCase()}` : 'ε = 0'}
          className="h-full"
        />
      </div>
      <p className="mt-3 text-[12px] leading-snug text-muted">
        Выбранный S = {money(winner.annual_surplus_mrub)} / год; среди равных по Q берётся больший S, ε = 0.
      </p>

      <div className="mt-4 flex flex-col gap-1 border-t border-line/70 pt-3">
        <Collapsible
          title={<span className="text-[15px] font-semibold">Шесть оценок</span>}
          summary={bottleneck ? `самое слабое место — ${bottleneck.title.toLowerCase()}` : undefined}
        >
          <ScoreRows components={winner.components} />
          <p className="mt-3 text-[12px] leading-snug text-muted">{analysis.normalization}</p>
        </Collapsible>

        <Collapsible
          title={<span className="text-[15px] font-semibold">Как денежный предел Δ меняет выбор</span>}
          summary={`${analysis.switching_curve.length} ${plural(analysis.switching_curve.length, ['интервал', 'интервала', 'интервалов'])}`}
        >
          <ul className="flex flex-col gap-2">
            {analysis.switching_curve.map((point) => (
              <li key={point.delta_from_mrub}>
                <Tile className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center sm:gap-3">
                  <span className="text-[13px] font-semibold tabular-nums">
                    Δ от {money(point.delta_from_mrub)}
                    {point.delta_to_exclusive_mrub === null ? ' и выше' : ` до ${money(point.delta_to_exclusive_mrub)}`}
                  </span>
                  <span className="text-[12.5px] text-ink/60">{selectionLabel(point.winner.selection)}</span>
                  <span className="text-[12px] text-muted tabular-nums">
                    S {money(point.winner.annual_surplus_mrub)} · Q {formatNumber(point.winner.q, 3)}
                  </span>
                </Tile>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted">
            Все точки смены победителя на текущих данных; левая граница включена, правая — нет.
          </p>
        </Collapsible>

        <Collapsible
          title={<span className="text-[15px] font-semibold">Чувствительность к допущениям</span>}
          summary={`${analysis.sensitivity.length} проверок · победитель меняется в ${changed}`}
        >
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {analysis.sensitivity.map((item) => <SensitivityCard key={item.id} item={item} />)}
          </ul>
          <p className="mt-3 text-[12px] leading-snug text-muted">
            Каждая проверка стартует от текущих входов: шкалы фиксированы, S_max и автоматический Δ
            пересчитываются, ручной Δ сохраняется. Шоки — допущения команды, не официальный STRESS.
          </p>
        </Collapsible>
      </div>

      <p className="mt-4 text-[12px] leading-snug text-muted">{analysis.caveat}</p>
    </Panel>
  )
}

function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1]
  return forms[2]
}

const ROW = 'grid gap-1 rounded-tile px-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_96px] sm:items-center sm:gap-3'

/** Шесть оценок победителя: значение, границы шкалы и оценка 0–1 полоской. */
function ScoreRows({ components }: { components: readonly ScoreComponent[] }) {
  return (
    <ul className="flex flex-col gap-1">
      <li className={cn(ROW, 'hidden py-1 text-[10px] font-bold tracking-[0.02em] text-ink/45 sm:grid')} aria-hidden>
        <span>Показатель</span>
        <span>Значение · шкала</span>
        <span>Оценка 0–1</span>
        <span />
      </li>
      {components.map((item) => {
        const width = Math.max(0, Math.min(1, item.normalized)) * 100
        return (
          <li key={item.key} className={cn(ROW, 'py-2', item.bottleneck && 'bg-warn-bg')}>
            <span className="text-[13px] font-semibold">
              {item.title}{' '}
              <span className="font-normal text-muted" title={item.direction === 'min' ? 'меньше — лучше' : 'больше — лучше'}>
                {item.direction === 'min' ? '↓' : '↑'}
              </span>
            </span>
            <span className="text-[12.5px] text-ink/60 tabular-nums">
              {formatNumber(item.raw, 2)}
              <span className="text-muted"> · {formatNumber(item.minimum, 2)}–{formatNumber(item.maximum, 2)}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/8" aria-hidden>
                <span className="block h-full rounded-full bg-brand" style={{ width: `${width}%` }} />
              </span>
              <span className="w-9 text-right text-[12.5px] font-semibold tabular-nums">{formatNumber(item.normalized, 2)}</span>
            </span>
            {item.bottleneck ? <Tag tone="warn">определяет Q</Tag> : <span className="hidden sm:block" />}
          </li>
        )
      })}
    </ul>
  )
}

/** Условия проверки одной строкой: только то, что отличает её от базовых входов. */
function describeAssumption(item: SensitivityCase): string {
  const parts = [`C0 ≤ ${money(item.budget_cap_mrub)}`, `VPUB ≥ ${money(item.vpub_floor_mrub_per_year)} / год`]
  if (item.cash_multiplier !== 1) parts.push(`CASH × ${formatNumber(item.cash_multiplier)}`)
  if (item.opex_multiplier !== 1) parts.push(`OPEX × ${formatNumber(item.opex_multiplier)}`)
  if (item.required_public_lot_ids.length > 0) parts.push(`ядро: ${item.required_public_lot_ids.join(', ')}`)
  return parts.join(' · ')
}

function SensitivityCard({ item }: { item: SensitivityCase }) {
  const { outcome } = item
  const tone = !outcome.winner ? 'fail' : outcome.winner_changed ? 'warn' : 'pass'
  const verdict = !outcome.winner ? 'допустимых нет' : outcome.winner_changed ? 'победитель меняется' : 'победитель прежний'

  return (
    <li>
      <Tile className="flex h-full flex-col gap-1.5 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] leading-tight font-semibold">{item.title}</span>
          <Tag tone={tone}>{verdict}</Tag>
        </div>
        <p className="text-[11.5px] leading-snug text-muted">{describeAssumption(item)}</p>
        {outcome.winner ? (
          <p className="text-[12px] leading-snug text-ink/70 tabular-nums">
            {selectionLabel(outcome.winner.selection)} · S {money(outcome.winner.annual_surplus_mrub)} · Q{' '}
            {formatNumber(outcome.winner.q, 3)} · Δ {money(item.effective_delta_mrub)}
          </p>
        ) : null}
        <p className="mt-auto text-[11.5px] leading-snug text-muted">
          Допустимых: {item.feasible_count}. Исходный портфель {outcome.original_still_feasible ? 'проходит' : 'не проходит'}
          {outcome.original_adjusted_surplus_mrub === null ? '' : `, его S здесь ${money(outcome.original_adjusted_surplus_mrub)} / год`}.
        </p>
      </Tile>
    </li>
  )
}
