import type { RecommendationExplanation } from '@shared/api/contracts'
import { Tag } from '@shared/ui'

type Props = {
  result: RecommendationExplanation | null
}

export function VariantExplanation({ result }: Props) {
  if (!result) return <p className="mt-3 text-[12px] text-muted">Объяснение отсутствует. Повторите подбор.</p>
  const scenario = result.scenario

  return (
    <div className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed" aria-label={`Объяснение варианта · ${scenario}`}>
      <p className="mb-2 font-semibold">Объяснение · {scenario}</p>
      {result ? (
        <>
          <Tag tone={result.generated_by === 'ollama' ? 'brand' : 'warn'}>
            {result.generated_by === 'ollama' ? (result.composition === 'extractive' ? 'AI выбрал факты' : 'Ollama') : 'Факты расчёта · без AI'}
          </Tag>
          <p className="mt-2 text-ink-700">{result.explanation.summary}</p>
          {result.warning ? <p className="mt-2 text-warn">{result.warning}</p> : null}
          {result.generated_by === 'template' ? <p className="mt-2 text-warn">Для повторной генерации запустите подбор заново.</p> : null}
        </>
      ) : null}
    </div>
  )
}
