import { Sparkles } from 'lucide-react'

import { useExplanation, type ExplanationStatus } from '@features'
import type { Calculation, ExplanationFact, ExplanationPoint, Scenario } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Button, Card, Panel, Skeleton, Tag, Tooltip } from '@shared/ui'

type Props = {
  datasetHash: string
  calculation: Calculation | undefined
  scenario: Scenario
  className?: string
}

/**
 * «Почему такой выбор?» — необязательное объяснение расчёта (бриф AI1).
 *
 * Модель ничего не считает и не выбирает: она излагает факты расчёта, каждый
 * тезис ссылается на факт, а числа подставляет сервер. Ошибка или отсутствие
 * Ollama не блокирует подбор, сравнение, сохранение и экспорт — блок просто
 * говорит об этом словами.
 */
export function ExplanationBlock({ datasetHash, calculation, scenario, className }: Props) {
  const explanation = useExplanation(datasetHash, calculation, scenario)
  const { status, result } = explanation

  return (
    <section
      className={cn('rise-in relative mx-auto w-full max-w-[880px] lg:pt-14 lg:pl-10', className)}
      aria-labelledby="explanation-title"
    >
      {/* Стикер стоит в верхнем поле секции (lg:pt-14), а не заезжает на блок выше:
          наклон и вынос влево — только на широких экранах. */}
      <Card
        className={cn(
          'relative z-10 mb-4 flex w-full max-w-[300px] flex-col gap-4 px-6 pt-5 pb-6',
          'lg:absolute lg:top-0 lg:left-[-84px] lg:mb-0 lg:-rotate-[8deg] lg:shadow-card-hover',
        )}
      >
        <Sparkles className="size-7 text-brand" aria-hidden />
        <h2 id="explanation-title" className="text-[20px] leading-tight font-bold text-brand">
          Почему такой выбор?
        </h2>
      </Card>

      <Panel className="relative min-h-[190px] px-7 pt-6 pb-7 lg:pt-[104px]">
        <div className="mb-3 flex items-center justify-end gap-2 lg:absolute lg:top-6 lg:right-8 lg:mb-0">
          <StatusLabel status={status} generatedBy={result?.generated_by} model={result?.model ?? null} />
        </div>

        <Body explanation={explanation} scenario={scenario} />
      </Panel>
    </section>
  )
}

function StatusLabel({
  status, generatedBy, model,
}: {
  status: ExplanationStatus
  generatedBy: 'ollama' | 'template' | undefined
  model: string | null
}) {
  if (status === 'succeeded' && generatedBy === 'ollama') {
    return (
      <span className="text-[14px] font-medium text-brand">
        Суммаризировано AI{model ? <span className="text-muted"> · {model}</span> : null}
      </span>
    )
  }
  if (status === 'succeeded') return <Tag tone="warn" size="md">Шаблонный текст · модель недоступна</Tag>
  return <span className="text-[14px] font-medium text-brand">Объяснение AI · необязательно</span>
}

function Body({
  explanation, scenario,
}: {
  explanation: ReturnType<typeof useExplanation>
  scenario: Scenario
}) {
  const { status, result, errorMessage, request } = explanation

  switch (status) {
    case 'unavailable':
      return <p className="text-[14px] text-muted">Объяснение доступно для полного портфеля из четырёх лотов.</p>

    case 'idle':
      return (
        <div className="flex flex-col items-start gap-4">
          <p className="max-w-[560px] text-[14px] leading-relaxed text-muted">
            Модель изложит, почему портфель проходит или не проходит проверки сценария {scenario}, опираясь
            только на факты расчёта. Числа подставляет сервер — свободный текст их не содержит.
          </p>
          <Button size="md" onClick={request}>
            <Sparkles className="size-4" aria-hidden />
            Объяснить выбор
          </Button>
        </div>
      )

    case 'loading':
      return (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          <p className="text-[13px] text-muted">
            Модель формирует объяснение — на процессоре это занимает одну–две минуты. Расчёт выше уже готов и от ответа не зависит.
          </p>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )

    case 'error':
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[14px] text-fail">
            Не удалось сформировать объяснение{errorMessage ? `: ${errorMessage}` : ''}.
          </p>
          <p className="text-[13px] text-muted">
            Подбор, проверки, сравнение и экспорт от этого не зависят: числа выше посчитаны движком.
          </p>
          <Button size="sm" variant="secondary" onClick={request}>Повторить</Button>
        </div>
      )

    case 'succeeded':
      if (!result) return null
      return <ExplanationText result={result} onRetry={request} />
  }
}

function ExplanationText({
  result, onRetry,
}: {
  result: NonNullable<ReturnType<typeof useExplanation>['result']>
  onRetry: () => void
}) {
  const factById = new Map(result.facts.map((fact) => [fact.id, fact]))
  const { explanation } = result

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[16px] font-semibold">{explanation.headline}</p>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-500">{explanation.summary}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PointList title="Сильные стороны" points={explanation.strengths} facts={factById} tone="pass" />
        <PointList title="Ограничения и оговорки" points={explanation.limitations} facts={factById} tone="warn" />
      </div>

      {result.warning ? <p className="text-[12px] text-warn">{result.warning}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11.5px] text-muted">
          Сценарий {result.scenario}. Каждый тезис ссылается на факт расчёта — наведите, чтобы увидеть, на какой.
        </p>
        {/* Шаблон — не приговор: когда модель поднимется, можно запросить текст заново. */}
        {result.generated_by === 'template' ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            <Sparkles className="size-3.5" aria-hidden />
            Запросить у модели снова
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function PointList({
  title, points, facts, tone,
}: {
  title: string
  points: ExplanationPoint[]
  facts: Map<string, ExplanationFact>
  tone: 'pass' | 'warn'
}) {
  if (points.length === 0) return null
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold tracking-[0.02em] text-muted uppercase">{title}</p>
      <ul className="flex flex-col gap-2">
        {points.map((point, index) => (
          <li key={index} className="flex gap-2 text-[13.5px] leading-snug">
            <span className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', tone === 'pass' ? 'bg-pass' : 'bg-warn')} aria-hidden />
            <Tooltip
              content={
                <ul className="flex flex-col gap-1">
                  {point.fact_ids.map((id) => (
                    <li key={id}>{facts.get(id)?.text ?? id}</li>
                  ))}
                </ul>
              }
            >
              <span tabIndex={0} className="cursor-help rounded-md decoration-dotted underline-offset-2 hover:underline">
                {point.text}
              </span>
            </Tooltip>
          </li>
        ))}
      </ul>
    </div>
  )
}
