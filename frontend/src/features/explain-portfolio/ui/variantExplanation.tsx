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
            {result.generated_by === 'ollama' ? 'Ollama' : 'Шаблон бэкенда'}
          </Tag>
          <p className="mt-2 text-ink-700">{result.explanation.summary}</p>
          <details className="mt-2">
            <summary className="cursor-pointer font-medium text-brand">Полное объяснение</summary>
            <p className="mt-2 font-semibold">{result.explanation.headline}</p>
            {[
              { title: 'Сильные стороны', points: result.explanation.strengths },
              { title: 'Ограничения', points: result.explanation.limitations },
            ].map(({ title, points }) => points.length ? (
              <div key={title} className="mt-2">
                <p className="font-semibold">{title}</p>
                <ul className="list-disc space-y-1 pl-4">
                  {points.map((point, index) => (
                    <li key={index} title={point.fact_ids.map((id) => result.facts.find((fact) => fact.id === id)?.text ?? id).join('\n')}>
                      {point.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null)}
            {result.model ? <p className="mt-2 text-muted">Модель: {result.model}</p> : null}
            {result.warning ? <p className="mt-2 text-warn">{result.warning}</p> : null}
          </details>
          {result.generated_by === 'template' ? <p className="mt-2 text-warn">Для повторной генерации запустите подбор заново.</p> : null}
        </>
      ) : null}
    </div>
  )
}
