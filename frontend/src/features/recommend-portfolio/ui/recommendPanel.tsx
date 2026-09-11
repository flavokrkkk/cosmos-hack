import type { MethodDefinition } from '@shared/api/contracts'

type Props = {
  method: MethodDefinition | undefined
  requireStress: boolean
  onRequireStressChange: (value: boolean) => void
  onRun: () => void
  isRunning: boolean
}

/**
 * Панель запуска подбора.
 *
 * Правило выбора показывается ДО запуска — иначе рекомендация выглядит как
 * ответ чёрного ящика. Метод помечен как допущение команды: канонического
 * «правильного портфеля» в кейсе нет, и выдавать наш порядок приоритетов
 * за требование организаторов нельзя.
 */
export function RecommendPanel({
  method, requireStress, onRequireStressChange, onRun, isRunning,
}: Props) {
  return (
    <section className="panel">
      <header className="panel__head">
        <h2>Подбор портфеля</h2>
        {method ? <span className="badge badge--neutral">метод: {method.origin}</span> : null}
      </header>

      {method ? (
        <>
          <p className="panel__lead">{method.title}</p>
          <p className="panel__muted">{method.description}</p>
          <ol className="priority-list">
            {method.priorities.map((priority) => (
              <li key={priority}>{priority}</li>
            ))}
          </ol>
        </>
      ) : null}

      <label className="switch">
        <input
          type="checkbox"
          checked={requireStress}
          onChange={(event) => onRequireStressChange(event.target.checked)}
        />
        <span>
          Искать только среди проходящих STRESS
          <span className="switch__note">
            портфель выдерживает сокращение бюджета без пересмотра состава
          </span>
        </span>
      </label>

      <button type="button" className="btn btn--primary btn--wide" onClick={onRun} disabled={isRunning}>
        {isRunning ? 'Считаем…' : 'Подобрать портфель'}
      </button>
    </section>
  )
}
