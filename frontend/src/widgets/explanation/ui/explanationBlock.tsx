import { Sparkle } from '@phosphor-icons/react'

import type { RecommendationExplanation } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Button, Card, Panel, Skeleton, Tag } from '@shared/ui'

type Props = {
  result: RecommendationExplanation | null | undefined
  isLoading?: boolean
  errorMessage?: string
  onRetry?: () => void
  className?: string
}

/**
 * «Почему такой выбор?» — необязательное объяснение расчёта (бриф AI1).
 *
 * Модель ничего не считает и не выбирает: она отбирает и излагает факты
 * расчёта, числа подставляет сервер. Объяснение приходит вторым запросом
 * после чисел, поэтому его задержка или отсутствие Ollama не блокирует
 * подбор, сравнение, сохранение и экспорт.
 */
export function ExplanationBlock({ result, isLoading, errorMessage, onRetry, className }: Props) {
  return (
    <section
      className={cn('rise-in relative mx-auto w-full max-w-[880px] lg:pt-14 lg:pl-10', className)}
      aria-labelledby="explanation-title"
    >
      {/* Стикер стоит в верхнем поле секции (lg:pt-14), а не заезжает на блок выше:
          наклон и вынос влево — только на широких экранах. */}
      <Card
        className={cn(
          'relative z-10 mb-4 flex w-full max-w-[300px] flex-col gap-4 bg-white/45 px-6 pt-5 pb-6 backdrop-blur-[18px]',
          'lg:absolute lg:top-0 lg:left-[-84px] lg:mb-0 lg:-rotate-[8deg] lg:shadow-card-hover',
        )}
      >
        <Sparkle className="size-7 text-brand" weight="fill" aria-hidden />
        <h2 id="explanation-title" className="text-[20px] leading-tight font-bold text-brand">
          Почему такой выбор?
        </h2>
      </Card>

      <Panel className="relative min-h-[190px] bg-white/30 px-7 pt-6 pb-7 backdrop-blur-[18px] lg:pt-[104px]" aria-busy={isLoading}>
        <div className="mb-3 flex items-center justify-end gap-2 lg:absolute lg:top-6 lg:right-8 lg:mb-0">
          <StatusLabel isLoading={isLoading} result={result} />
        </div>

        {isLoading && !result ? (
          <div className="flex flex-col gap-3" role="status" aria-live="polite">
            <p className="text-[13px] text-muted">Готовим объяснение…</p>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : errorMessage && !result ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[14px] text-fail">Объяснение не получено: {errorMessage}.</p>
            {onRetry ? <Button size="sm" variant="secondary" onClick={onRetry}>Повторить</Button> : null}
          </div>
        ) : result ? (
          <ExplanationText result={result} onRetry={onRetry} isLoading={isLoading} />
        ) : (
          <div className="flex min-h-[92px] items-center justify-center rounded-card bg-white/20 px-5 text-center backdrop-blur-[18px]">
            <p className="text-[18px] leading-snug text-muted">Объяснение появится после подбора.</p>
          </div>
        )}
      </Panel>
    </section>
  )
}

function StatusLabel({ isLoading, result }: { isLoading?: boolean; result: RecommendationExplanation | null | undefined }) {
  if (result?.generated_by === 'ollama') {
    return (
      <span className="text-[14px] font-medium text-brand">
        Объяснение AI
      </span>
    )
  }
  if (result) return <Tag tone="warn" size="md">Объяснение по шаблону</Tag>
  if (isLoading) return <Tag tone="brand" size="md">Готовим объяснение…</Tag>
  return <span className="text-[14px] font-medium text-brand">Объяснение AI</span>
}

function ExplanationText({
  result, onRetry, isLoading,
}: {
  result: RecommendationExplanation
  onRetry?: () => void
  isLoading?: boolean
}) {
  const { explanation } = result

  return (
    <div className={cn('flex flex-col gap-4', isLoading && 'is-stale')}>
      <div>
        <p className="text-[16px] font-semibold">Краткий вывод</p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-500">{explanation.summary}</p>
      </div>

      {result.warning ? <p className="text-[12px] text-warn">{result.warning}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11.5px] text-muted">
          Сценарий {result.scenario}
        </p>
        {/* Шаблон — не приговор: когда модель поднимется, можно запросить текст заново. */}
        {result.generated_by === 'template' && onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry} loading={isLoading}>
            <Sparkle className="size-3.5" weight="fill" aria-hidden />
            Повторить с AI
          </Button>
        ) : null}
      </div>
    </div>
  )
}
