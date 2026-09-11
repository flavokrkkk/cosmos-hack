import { useMemo, useState } from 'react'

import {
  DELTA_ROWS, DELTA_VERDICT_LABEL, deltaVerdict, formatDelta, formatNumber, scenarioVerdict,
  selectionKey, selectionLabel, useCompare, useComparison, useComparisonAnalysis,
} from '@entities/portfolio'
import type { ComparisonResult, Scenario } from '@shared/api/contracts'
import { SCENARIOS } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Button, Dialog, DialogContent, Tag, Segmented, Tooltip } from '@shared/ui'

import { MAX_VARIANTS, MIN_VARIANTS, type Candidate } from '../model/candidates'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  datasetHash: string
  candidates: Candidate[]
  /** Что отметить при открытии: обычно открытый вариант и рекомендация. */
  initialIds: string[]
}

/**
 * Сопоставление вариантов — критерий Т4.
 *
 * Колонки считал один движок на одном `dataset_hash`; фронтенд ничего не
 * пересчитывает. BASE и STRESS показаны для ОДНОГО состава: сценарий меняет
 * только пороги. Дельты подписаны по каждому показателю отдельно — «выигрыш»
 * или «плата»; общего балла нет, он потребовал бы весов.
 */
export function CompareDialog({ open, onOpenChange, datasetHash, candidates, initialIds }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        title="Сравнение вариантов"
        description={`Отметьте от ${MIN_VARIANTS} до ${MAX_VARIANTS} вариантов. Первый отмеченный — база сравнения: дельты считаются к нему.`}
      >
        {/* Содержимое монтируется при каждом открытии — состояние отметок стартует заново. */}
        <CompareBody datasetHash={datasetHash} candidates={candidates} initialIds={initialIds} />
      </DialogContent>
    </Dialog>
  )
}

function CompareBody({ datasetHash, candidates, initialIds }: Omit<Props, 'open' | 'onOpenChange'>) {
  const compare = useCompare()
  const remember = useComparison((state) => state.set)
  const [picked, setPicked] = useState<string[]>(() =>
    initialIds.filter((id) => candidates.some((c) => c.id === id && !c.incompatible)),
  )

  const selected = useMemo(
    () => picked.map((id) => candidates.find((c) => c.id === id)).filter((c): c is Candidate => Boolean(c)),
    [picked, candidates],
  )

  const stored = useComparison((state) => state.result)
  /* После закрытия окна мутация теряется, но результат остаётся в сторе для экспорта и повторного показа. */
  const result = compare.data ?? stored ?? undefined
  const resultKey = result ? result.variants.map((v) => selectionKey(v.selection)).join(' vs ') : ''
  const pickedKey = picked.join(' vs ')
  const isStale = Boolean(result) && (resultKey !== pickedKey || result!.variants.some((variant) => variant.dataset_hash !== datasetHash))

  function toggle(id: string) {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= MAX_VARIANTS) return current
      return [...current, id]
    })
  }

  function run() {
    const titles = selected.map((c) => c.title)
    compare.mutate(
      { variants: selected.map((c) => ({ dataset_hash: datasetHash, selection: c.selection })) },
      { onSuccess: (data) => remember(data, titles) },
    )
  }

  const canCompare = picked.length >= MIN_VARIANTS && picked.length <= MAX_VARIANTS

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {candidates.map((candidate) => {
            const order = picked.indexOf(candidate.id)
            const checked = order >= 0
            const disabled = candidate.incompatible || (!checked && picked.length >= MAX_VARIANTS)
            return (
              <li key={candidate.id}>
                <label
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-2xl bg-panel px-3.5 py-3 transition-colors',
                    checked && 'bg-brand-50 ring-1 ring-brand/30',
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-brand"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(candidate.id)}
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold">
                      {candidate.title}
                      {order === 0 ? <Tag tone="brand">база</Tag> : null}
                    </span>
                    <span className="text-[11.5px] text-muted">{candidate.sourceLabel}</span>
                    <span className="text-[12px] text-ink-500 tabular-nums">
                      {selectionLabel(candidate.selection)}
                    </span>
                    {candidate.incompatible ? (
                      <span className="text-[11.5px] text-warn">сохранён под другой версией данных</span>
                    ) : candidate.feasible ? (
                      <span className="flex gap-1.5">
                        {SCENARIOS.map((scenario) => (
                          <Tag key={scenario} tone={candidate.feasible?.[scenario] ? 'pass' : 'fail'}>
                            {scenario}
                          </Tag>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        <Button onClick={run} disabled={!canCompare} loading={compare.isPending} size="md" className="w-full">
          Сравнить {picked.length > 0 ? `(${picked.length})` : ''}
        </Button>
        {!canCompare ? (
          <p className="text-center text-[12px] text-muted">Нужно минимум {MIN_VARIANTS} варианта.</p>
        ) : null}
      </aside>

      <section className="min-w-0">
        {compare.isError ? (
          <p className="rounded-2xl bg-fail-bg px-4 py-3 text-[13px] text-fail">
            Сравнение не выполнено: {compare.error.message}
          </p>
        ) : null}

        {!result ? (
          <div className="flex h-full min-h-[240px] items-center justify-center rounded-card bg-panel px-6 text-center text-[13.5px] text-muted">
            Отметьте варианты слева и нажмите «Сравнить». Числа посчитает бэкенд — той же
            арифметикой, что и одиночные портфели.
          </div>
        ) : (
          <div className={cn(isStale && 'is-stale')}>
            {isStale ? (
              <p className="mb-3 rounded-2xl bg-warn-bg px-4 py-2.5 text-[12.5px] text-warn">
                Набор вариантов изменился. Таблица относится к предыдущему набору — нажмите
                «Сравнить», чтобы пересчитать.
              </p>
            ) : null}
            <ComparisonTable
              result={result}
              titles={
                isStale
                  ? result.variants.map((_, index) => `Вариант ${index + 1}`)
                  : selected.map((c) => c.title)
              }
            />
            {!isStale && !compare.isPending ? (
              <ComparisonAnalysis key={JSON.stringify(result.variants.map((variant) => variant.input_hash))} result={result} />
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}

function ComparisonAnalysis({ result }: { result: ComparisonResult }) {
  const [scenario, setScenario] = useState<Scenario>('STRESS')
  const [launchedKey, setLaunchedKey] = useState<string | null>(null)
  const request = {
    variants: result.variants.map((variant) => ({ dataset_hash: variant.dataset_hash, selection: variant.selection })),
    scenario,
  }
  const requestKey = JSON.stringify(request)
  const launched = launchedKey === requestKey
  const query = useComparisonAnalysis(request, launched)
  const analysis = launched ? query.data : undefined
  return (
    <section className="mt-5 rounded-card bg-panel p-5" aria-busy={query.isFetching}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[18px] font-semibold">AI-анализ сравнения</h3>
        <Segmented size="sm" value={scenario} onChange={(value: Scenario) => setScenario(value)}
          options={SCENARIOS.map((value) => ({ value, label: value }))} label="Сценарий AI-анализа сравнения" />
      </div>
      <p className="mt-2 text-[13px] text-muted">
        Первый, второй и остальные варианты — колонки таблицы слева направо.
        AI объяснит компромиссы относительно первого, но не выберет победителя.
      </p>
      <Button className="mt-4" size="md" loading={query.isFetching} onClick={() => {
        if (launched) void query.refetch()
        else setLaunchedKey(requestKey)
      }}>Проанализировать с AI</Button>
      {query.isFetching ? <p role="status" className="mt-3 text-[13px] text-muted">Готовим анализ выбранных портфелей — до минуты. Таблица уже доступна.</p> : null}
      {launched && query.isError ? <p className="mt-3 text-[13px] text-fail">Анализ не получен: {query.error.message}. Расчёты в таблице доступны.</p> : null}
      {analysis && !query.isFetching ? (
        <div className="mt-4 flex flex-col gap-3">
          <Tag tone={analysis.generated_by === 'ollama' ? 'brand' : 'warn'}>
            {analysis.generated_by === 'ollama' ? 'Суммаризировано AI' : 'Шаблон по расчёту'} · {analysis.scenario}
          </Tag>
          <p className="font-semibold">{analysis.explanation.headline}</p>
          <p className="text-[14px]">{analysis.explanation.summary}</p>
          {([
            ['Преимущества и различия', analysis.explanation.strengths],
            ['Компромиссы и ограничения', analysis.explanation.limitations],
          ] as const).map(([title, points]) => (
            <div key={title}>
              <h4 className="mb-2 text-[13px] font-semibold">{title}</h4>
              <ul className="list-inside list-disc space-y-2 text-[13px]">
                {points.map((point, index) => (
                  <li key={index}><Tooltip content={point.fact_ids.map((id) => analysis.facts.find((fact) => fact.id === id)?.text).join(' ')}>
                    <span className="cursor-help border-b border-dotted border-muted">{point.text}</span>
                  </Tooltip></li>
                ))}
              </ul>
            </div>
          ))}
          {analysis.warning ? <p className="text-[12px] text-warn">{analysis.warning}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

function ComparisonTable({ result, titles }: { result: ComparisonResult; titles: string[] }) {
  const { variants, baseline_index: baselineIndex } = result

  return (
    <div className="overflow-x-auto rounded-card bg-panel p-2">
      <table className="w-full min-w-[560px] border-separate border-spacing-y-1 text-[13px]">
        <thead>
          <tr>
            <th scope="col" className="px-3 py-2 text-left text-[11.5px] font-medium text-muted">
              Показатель
            </th>
            {variants.map((variant, index) => (
              <th key={variant.input_hash} scope="col" className="px-3 py-2 text-left align-top">
                <span className="block text-[14px] font-semibold">{titles[index] ?? `Вариант ${index + 1}`}</span>
                <span className="mt-0.5 block text-[11.5px] font-normal text-muted tabular-nums">
                  {selectionLabel(variant.selection)}
                </span>
                {index === baselineIndex ? <Tag tone="brand" className="mt-1">база сравнения</Tag> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCENARIOS.map((scenario) => (
            <ScenarioRow key={scenario} scenario={scenario} result={result} />
          ))}
          {DELTA_ROWS.map((row) => (
            <tr key={row.key} className="bg-card">
              <th scope="row" className="rounded-l-xl px-3 py-2.5 text-left font-medium">
                {row.title}
                <span className="block text-[11px] font-normal text-muted">
                  {row.unit ? `${row.unit} · ` : ''}лучше {row.better === 'more' ? 'больше' : 'меньше'}
                </span>
              </th>
              {variants.map((variant, index) => {
                const value = variant.metrics ? variant.metrics[row.key] : null
                const delta = result.deltas[index]?.[row.key]
                const verdict = delta === undefined ? 'same' : deltaVerdict(delta, row.better)
                const last = index === variants.length - 1
                return (
                  <td key={variant.input_hash} className={cn('px-3 py-2.5 align-top tabular-nums', last && 'rounded-r-xl')}>
                    <span className="block text-[15px] font-semibold">
                      {value === null ? '—' : formatNumber(value)}
                    </span>
                    {index === baselineIndex || delta === undefined ? null : (
                      <Tag tone={verdict === 'gain' ? 'pass' : verdict === 'cost' ? 'fail' : 'muted'} className="mt-1">
                        {formatDelta(delta)} · {DELTA_VERDICT_LABEL[verdict]}
                      </Tag>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 pt-3 pb-2 text-[11.5px] leading-snug text-muted">
        Дельты считаются к базе и подписаны по каждому показателю отдельно. Общего балла нет —
        он потребовал бы весов, а метод команды весов не вводит. Общественная ценность и
        денежные поступления не складываются: это разные контуры.
      </p>
    </div>
  )
}

function ScenarioRow({ scenario, result }: { scenario: Scenario; result: ComparisonResult }) {
  return (
    <tr className="bg-card">
      <th scope="row" className="rounded-l-xl px-3 py-2.5 text-left font-medium">
        Проверка {scenario}
        <span className="block text-[11px] font-normal text-muted">те же лоты и режимы; отличаются пороги</span>
      </th>
      {result.variants.map((variant, index) => {
        const verdict = scenarioVerdict(variant, scenario)
        const last = index === result.variants.length - 1
        return (
          <td key={variant.input_hash} className={cn('px-3 py-2.5 align-top', last && 'rounded-r-xl')}>
            <Tag tone={verdict.feasible ? 'pass' : 'fail'}>{verdict.feasible ? 'проходит' : 'не проходит'}</Tag>
            <span className="mt-1 block text-[11.5px] text-muted">
              выполнено {verdict.passed} из {verdict.total}
              {verdict.failedCodes.length ? ` · нарушено: ${verdict.failedCodes.join(', ')}` : ''}
            </span>
          </td>
        )
      })}
    </tr>
  )
}
