import { Sparkles } from 'lucide-react'

import type { RecommendationExplanation } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Button, Card, Panel, Skeleton, Tag } from '@shared/ui'

type Props = {
  result: RecommendationExplanation | null | undefined
  isLoading?: boolean
  onRetry?: () => void
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
export function ExplanationBlock({ result, isLoading, onRetry, className }: Props) {
  const status = isLoading ? 'loading' : result ? 'succeeded' : 'unavailable'

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
          <StatusLabel status={status} generatedBy={result?.generated_by} model={result?.model ?? null} composition={result?.composition} />
        </div>

        {isLoading ? <Skeleton className="h-16 w-full" /> : result ? (
          <ExplanationText result={result} onRetry={onRetry} />
        ) : <p className="text-[14px] text-muted">Для этого варианта нет объяснения в текущем результате подбора.</p>}
      </Panel>
    </section>
  )
}

function StatusLabel({
  status, generatedBy, model, composition,
}: {
  status: 'loading' | 'succeeded' | 'unavailable'
  generatedBy: 'ollama' | 'template' | undefined
  model: string | null
  composition?: 'generative' | 'extractive'
}) {
  if (status === 'succeeded' && generatedBy === 'ollama') {
    return (
      <span className="text-[14px] font-medium text-brand">
        {composition === 'extractive' ? 'AI выбрал акценты · факты расчёта' : 'Суммаризировано AI'}{model ? <span className="text-muted"> · {model}</span> : null}
      </span>
    )
  }
  if (status === 'succeeded') return <Tag tone="warn" size="md">Шаблонный текст · модель недоступна</Tag>
  return <span className="text-[14px] font-medium text-brand">Объяснение AI · необязательно</span>
}

function ExplanationText({
  result, onRetry,
}: {
  result: RecommendationExplanation
  onRetry?: () => void
}) {
  const { explanation } = result

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[16px] font-semibold">Краткий вывод</p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-500">{explanation.summary}</p>
      </div>

      {result.warning ? <p className="text-[12px] text-warn">{result.warning}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11.5px] text-muted">
          Объяснение для условия поиска {result.scenario}, составленное по проверенным фактам расчёта.
        </p>
        {/* Шаблон — не приговор: когда модель поднимется, можно запросить текст заново. */}
        {result.generated_by === 'template' && onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            <Sparkles className="size-3.5" aria-hidden />
            Повторить подбор и объяснение
          </Button>
        ) : null}
      </div>
    </div>
  )
}
