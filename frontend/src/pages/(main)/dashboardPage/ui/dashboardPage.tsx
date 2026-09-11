import { useMemo, useState } from 'react'

import { LotCard, useCatalog } from '@entities/case'
import {
  ConstraintsTable, MetricsTable, selectionLabel, useEvaluate, useRecommend,
} from '@entities/portfolio'
import { PORTFOLIO_SIZE, RecommendPanel, usePortfolioDraft } from '@features'
import type {
  AccessMode, Calculation, RecommendationResult, Scenario,
} from '@shared/api/contracts'
import { SCENARIOS } from '@shared/api/contracts'

/** Стабильная ссылка: иначе `?? []` создаёт новый массив на каждый рендер. */
const NO_MODES: AccessMode[] = []

export default function DashboardPage() {
  const catalog = useCatalog()
  const recommend = useRecommend()

  const [scenario, setScenario] = useState<Scenario>('STRESS')
  const [requireStress, setRequireStress] = useState(true)

  const modes = catalog.data?.modes ?? NO_MODES
  const publicCoreMode = modes.find((mode) => mode.public_core)
  const draft = usePortfolioDraft(publicCoreMode)

  const evaluation = useEvaluate(catalog.data?.dataset_hash, draft.selection)

  const recommendation: RecommendationResult | undefined = recommend.data
  const modeById = useMemo(
    () => new Map(modes.map((mode) => [mode.mode_id, mode])),
    [modes],
  )

  function runRecommend() {
    if (!catalog.data) return
    recommend.mutate({
      dataset_hash: catalog.data.dataset_hash,
      require_stress: requireStress,
      method_id: 'pareto_lexicographic_v1',
    })
  }

  if (catalog.isPending) {
    return <main className="shell"><p className="state">Загружаем каталог кейса…</p></main>
  }

  if (catalog.isError || !catalog.data) {
    return (
      <main className="shell">
        <p className="state state--error">
          Каталог не загрузился. Проверьте, что backend запущен на{' '}
          <code>{import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}</code>.
        </p>
      </main>
    )
  }

  const { lots, dataset_hash, case_id, case_version, engine_version, constraints } = catalog.data

  return (
    <main className="shell">
      <header className="shell__head">
        <div>
          <p className="eyebrow">КосмоХакатон · Кейс 02 «Космос как инфраструктура»</p>
          <h1>Подбор портфеля космических сервисов</h1>
        </div>
        {/* Версия данных на виду: README §14, сценарий 1 — эксперт должен
            сразу видеть, что использован официальный датасет. */}
        <dl className="version">
          <div><dt>Кейс</dt><dd>{case_id} · v{case_version}</dd></div>
          <div><dt>Движок</dt><dd>{engine_version}</dd></div>
          <div><dt>Данные</dt><dd><code>{dataset_hash.slice(0, 12)}…</code></dd></div>
        </dl>
      </header>

      <RecommendPanel
        method={catalog.data.methods[0]}
        requireStress={requireStress}
        onRequireStressChange={setRequireStress}
        onRun={runRecommend}
        isRunning={recommend.isPending}
      />

      {recommendation ? (
        <RecommendationBlock
          result={recommendation}
          onEdit={() =>
            recommendation.recommended &&
            draft.replace(recommendation.recommended.calculation.selection)
          }
        />
      ) : null}

      <section className="panel">
        <header className="panel__head">
          <h2>Каталог лотов</h2>
          <span className="badge badge--neutral">
            выбрано {draft.selection.length} из {PORTFOLIO_SIZE}
          </span>
        </header>
        <p className="panel__muted">
          Числа на карточках — исходные значения каталога, без коэффициентов режима.
          Пересчитанные показатели портфеля — в таблице ниже.
        </p>
        <div className="lot-grid">
          {lots.map((lot) => {
            const item = draft.selection.find((entry) => entry.lot_id === lot.lot_id)
            return (
              <LotCard
                key={lot.lot_id}
                lot={lot}
                modes={modes}
                mode={item ? modeById.get(item.mode_id) : undefined}
                selected={Boolean(item)}
                disabled={draft.selection.length >= PORTFOLIO_SIZE}
                onToggle={draft.toggle}
                onModeChange={draft.setMode}
              />
            )
          })}
        </div>
      </section>

      <section className="panel">
        <header className="panel__head">
          <h2>Текущий портфель</h2>
          <div className="scenario-switch" role="group" aria-label="Сценарий проверки">
            {SCENARIOS.map((item) => (
              <button
                key={item}
                type="button"
                className={`btn btn--tab ${scenario === item ? 'is-active' : ''}`}
                onClick={() => setScenario(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </header>

        <p className="panel__muted">
          Переключатель сценария меняет только пороги проверки. Состав портфеля,
          режимы доступа и цены лотов при этом не меняются.
        </p>

        {draft.selection.length === 0 ? (
          <p className="state">
            Лоты не выбраны. Нажмите «Подобрать портфель» или выберите четыре лота вручную.
          </p>
        ) : (
          <PortfolioResult
            calculation={evaluation.data}
            isPending={evaluation.isFetching}
            scenario={scenario}
            selectionLabelText={selectionLabel(draft.selection)}
            origin={draft.origin}
            onReset={draft.reset}
            fallbackChecks={constraints[scenario].length}
          />
        )}
      </section>
    </main>
  )
}

function RecommendationBlock({
  result, onEdit,
}: {
  result: RecommendationResult
  onEdit: () => void
}) {
  if (result.status === 'no_feasible' || !result.recommended) {
    return (
      <section className="panel panel--warning">
        <h2>Допустимых портфелей нет</h2>
        <p>
          Проверено конфигураций: {result.considered_count}. Ни одна не проходит все
          ограничения при выбранных условиях. Мы не ослабляем условия и не показываем
          «наименее плохой» вариант как допустимый.
        </p>
      </section>
    )
  }

  const { recommended, alternatives } = result

  return (
    <section className="panel panel--accent">
      <header className="panel__head">
        <h2>Рекомендация алгоритма</h2>
        <button type="button" className="btn btn--ghost" onClick={onEdit}>
          Изменить вручную
        </button>
      </header>

      <p className="recommendation__selection">
        {selectionLabel(recommended.calculation.selection)}
      </p>
      <p className="panel__muted">{recommended.reason}</p>

      <dl className="space-stats">
        <div><dt>Рассмотрено</dt><dd>{result.considered_count}</dd></div>
        <div><dt>Проходит BASE</dt><dd>{result.base_count}</dd></div>
        <div><dt>Проходит STRESS</dt><dd>{result.stress_count}</dd></div>
        <div><dt>Недоминируемых</dt><dd>{result.pareto_count}</dd></div>
      </dl>

      {alternatives.length > 0 ? (
        <>
          <h3 className="panel__subhead">Альтернативы</h3>
          <ul className="alternatives">
            {alternatives.map((variant) => (
              <li key={variant.calculation.input_hash}>
                <strong>{variant.title}</strong>
                <span className="alternatives__selection">
                  {selectionLabel(variant.calculation.selection)}
                </span>
                <span className="panel__muted">{variant.reason}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="panel__note">
        Алгоритм сокращает пространство до недоминируемых вариантов. Итоговый выбор
        между ними — решение команды, а не результат вычисления.
      </p>
    </section>
  )
}

function PortfolioResult({
  calculation, isPending, scenario, selectionLabelText, origin, onReset, fallbackChecks,
}: {
  calculation: Calculation | undefined
  isPending: boolean
  scenario: Scenario
  selectionLabelText: string
  origin: 'empty' | 'manual' | 'copy'
  onReset: () => void
  fallbackChecks: number
}) {
  const checks = calculation?.checks[scenario]

  return (
    <div className="result">
      <div className="result__head">
        <p className="result__selection">{selectionLabelText}</p>
        <div className="result__actions">
          {origin === 'copy' ? (
            <span className="badge badge--neutral">копия рекомендации</span>
          ) : null}
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            Очистить
          </button>
        </div>
      </div>

      {/* Пока идёт пересчёт, старые числа помечены устаревшими: иначе их можно
          принять за результат нового выбора. */}
      <div className={isPending ? 'result__body is-stale' : 'result__body'}>
        {/* Неполный портфель: движок возвращает промежуточную сумму по выбранным
            лотам, но это НЕ итог портфеля. Выдавать её за итог нельзя — четыре
            лота требуются по условию, и проверки до полного состава не считаются. */}
        {calculation?.status === 'incomplete' ? (
          <p className="state">
            Выбрано {calculation.selection.length} из {PORTFOLIO_SIZE} лотов. Портфель
            неполный: {fallbackChecks} условий ждут полного состава, а промежуточная
            сумма по выбранным лотам итогом портфеля не является и здесь не показывается.
          </p>
        ) : null}

        {calculation?.status === 'complete' && calculation.metrics ? (
          <div className="result__tables">
            <MetricsTable metrics={calculation.metrics} />
            {checks ? (
              <ConstraintsTable checks={checks} scenario={scenario} />
            ) : (
              <p className="state">Проверки по сценарию {scenario} не пришли от backend.</p>
            )}
          </div>
        ) : null}

        {!calculation && !isPending ? <p className="state">Считаем…</p> : null}
      </div>
    </div>
  )
}
