import type { Calculation, Scenario } from '@shared/api/contracts'
import { Button, Tag } from '@shared/ui'

import { useExplanation } from '../model/useExplanation'

type Props = {
  calculation: Calculation
  scenario: Scenario
}

export function VariantExplanation({ calculation, scenario }: Props) {
  const { status, result, errorMessage, request } = useExplanation(
    calculation.dataset_hash, calculation, scenario,
  )

  return (
    <div className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed" aria-label={`Объяснение варианта · ${scenario}`}>
      <p className="mb-2 font-semibold">Объяснение · {scenario}</p>
      {status === 'idle' || status === 'loading' ? (
        <p role="status" className="text-muted">Готовим объяснение. Варианты обрабатываются по очереди…</p>
      ) : status === 'error' ? (
        <>
          <p role="alert" className="text-fail">{errorMessage ?? 'Не удалось получить объяснение.'}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={request}>Повторить объяснение</Button>
        </>
      ) : result ? (
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
          {result.generated_by === 'template' ? (
            <Button size="sm" variant="secondary" className="mt-2" onClick={request}>Повторить с Ollama</Button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
