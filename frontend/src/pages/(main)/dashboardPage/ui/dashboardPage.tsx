import { useMemo, useState } from 'react'

import { LotCard, useCatalog } from '@entities/case'
import {
  ConstraintsTable, MetricsTable, selectionLabel, useEvaluate, useRecommend,
} from '@entities/portfolio'
import {
  ComparePanel, ExportPanel, PORTFOLIO_SIZE, RecommendPanel, usePortfolioDraft,
} from '@features'
import type {
  AccessMode, Calculation, ComparisonResult, RecommendationResult, Scenario,
} from '@shared/api/contracts'
import { SCENARIOS } from '@shared/api/contracts'
import { SolutionMaterials } from '@widgets'

/** Стабильная ссылка: иначе `?? []` создаёт новый массив на каждый рендер. */
const NO_MODES: AccessMode[] = []

export default function DashboardPage() {
  const catalog = useCatalog()
  const recommend = useRecommend()

  const [scenario, setScenario] = useState<Scenario>('STRESS')
  const [requireStress, setRequireStress] = useState(true)
  /** Результат сравнения поднят сюда: его забирает экспорт как comparison.csv. */
  const [comparison, setComparison] = useState<ComparisonResult | undefined>()

  const modes = catalog.data?.modes ?? NO_MODES
  const publicCoreMode = modes.find((mode) => mode.public_core)
  const draft = usePortfolioDraft(publicCoreMode)

  const evaluation = useEvaluate(catalog.data?.dataset_hash, draft.selection)

  const recommendation: RecommendationResult | undefined = recommend.data
  const modeById = useMemo(
    () => new Map(modes.map((mode) => [mode.mode_id, mode])),
    [modes],
  )

  /**
   * Запуск подбора с явно указанным условием.
   *
   * Условие поиска — состояние страницы, а не скрытый параметр запроса:
   * если подбор пошёл в BASE, переключатель обязан это показывать. Иначе
   * на экране «ищем только среди проходящих STRESS», а в ответе — портфель,
   * который стресс не проверяли.
   */
  function search(required: boolean) {
    if (!catalog.data) return
    setRequireStress(required)
    recommend.mutate({
      dataset_hash: catalog.data.dataset_hash,
      require_stress: required,
      method_id: 'pareto_lexicographic_v1',
    })
  }

  /** Обработчик кнопки панели: аргументы события игнорируем осознанно. */
  function runRecommend() {
    search(requireStress)
  }

  if (catalog.isPending) {
    return (
      <main className="shell">
        <p className="state state--loading" role="status">Загружаем каталог кейса…</p>
      </main>
    )
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

      {/* Ошибка подбора видна на странице, а не только тостом: тост уходит через
          шесть секунд, а «Повторить» нужно там, где человек ждал результат.
          Сохранённый пример портфеля вместо ошибки не показываем. */}
      {recommend.isError && !recommend.isPending ? (
        <section className="panel panel--warning">
          <header className="panel__head">
            <h2>Подбор не выполнен</h2>
            <button type="button" className="btn btn--ghost" onClick={runRecommend}>
              Повторить
            </button>
          </header>
          <p className="panel__lead">{recommend.error.message}</p>
          <p className="panel__muted">
            Это сбой запроса, а не результат расчёта: допустимость портфелей не
            проверена, и делать вывод «подходящих вариантов нет» по этой ошибке нельзя.
          </p>
        </section>
      ) : null}

      {recommendation ? (
        <RecommendationBlock
          result={recommendation}
          isRerunning={recommend.isPending}
          onEdit={(calculation) => draft.replace(calculation.selection)}
          onSearchInBase={() => search(false)}
        />
      ) : null}

      <section className="panel" id="catalog">
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
                /* aria-pressed, а не только класс: с клавиатуры и в скринридере
                   должно быть слышно, какой сценарий сейчас выбран. */
                aria-pressed={scenario === item}
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
            isError={evaluation.isError}
            scenario={scenario}
            selectionLabelText={selectionLabel(draft.selection)}
            origin={draft.origin}
            onReset={draft.reset}
            fallbackChecks={constraints[scenario].length}
          />
        )}
      </section>

      <ComparePanel
        datasetHash={dataset_hash}
        recommendation={recommendation}
        draft={draft.selection}
        draftOrigin={draft.origin}
        onResult={setComparison}
      />

      <ExportPanel
        calculation={evaluation.data}
        catalog={catalog.data}
        comparison={comparison}
      />

      {/* Материалы доступны всегда, даже до расчёта: эксперт должен находить
          записку, стресс-резюме и инструкцию запуска, ничего не считая. */}
      <SolutionMaterials catalog={catalog.data} isDraft={draft.origin !== 'empty'} />
    </main>
  )
}

/** Счётчики перебора: единственное, что движок сообщает об отсеве. */
function SearchStats({ result }: { result: RecommendationResult }) {
  return (
    <dl className="space-stats">
      <div><dt>Рассмотрено</dt><dd>{result.considered_count}</dd></div>
      <div><dt>Проходит BASE</dt><dd>{result.base_count}</dd></div>
      <div><dt>Проходит STRESS</dt><dd>{result.stress_count}</dd></div>
      <div><dt>Недоминируемых</dt><dd>{result.pareto_count}</dd></div>
    </dl>
  )
}

function RecommendationBlock({
  result, isRerunning, onEdit, onSearchInBase,
}: {
  result: RecommendationResult
  /** Запущен новый подбор, а на экране всё ещё прошлый результат. */
  isRerunning: boolean
  onEdit: (calculation: Calculation) => void
  onSearchInBase: () => void
}) {
  if (result.status === 'no_feasible') {
    /*
     * Отсутствие допустимого варианта — законный результат расчёта, а не ошибка
     * и не пустой портфель 0/4. Поэтому панель не «предупреждение».
     *
     * Условия сами не ослабляем: единственное предложенное действие — явный
     * поиск в BASE, и только когда он вообще имеет смысл (в STRESS не прошёл
     * никто, а в BASE варианты есть).
     */
    const canSearchInBase = result.request.require_stress && result.base_count > 0

    return (
      <section className="panel panel--notice">
        <header className="panel__head">
          <h2>Допустимого портфеля нет</h2>
          <span className="badge badge--neutral">
            условие поиска: {result.request.require_stress ? 'STRESS' : 'BASE'}
          </span>
        </header>

        <p className="panel__lead">
          При выбранных условиях допустимый портфель не найден.
        </p>

        <SearchStats result={result} />

        {canSearchInBase ? (
          <>
            <p className="panel__muted">
              {result.base_count} конфигураций проходят BASE, но ни одна не выдерживает
              сокращение бюджета. «Искать в BASE» меняет условие поиска: найденный
              портфель проверку STRESS не проходил, и ответ на стресс придётся
              готовить отдельно.
            </p>
            <div className="result__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={onSearchInBase}
                disabled={isRerunning}
              >
                {isRerunning ? 'Подбираем…' : 'Искать в BASE'}
              </button>
              <a className="btn btn--ghost" href="#catalog">Собрать вариант вручную</a>
            </div>
          </>
        ) : (
          <>
            <p className="panel__muted">
              Ни одна из {result.considered_count} конфигураций не проходит даже BASE.
              Мы не ослабляем ограничения и не показываем «наименее плохой» вариант
              как допустимый — условия меняет команда, а не интерфейс.
            </p>
            <div className="result__actions">
              <a className="btn btn--ghost" href="#catalog">Собрать вариант вручную</a>
            </div>
          </>
        )}

        <p className="panel__note">
          Разбора по каждому ограничению движок в ответе не возвращает, поэтому причин
          отсева мы не домысливаем: выше ровно то, что он посчитал.
        </p>
      </section>
    )
  }

  const { recommended, alternatives } = result

  return (
    <section className={`panel panel--accent${isRerunning ? ' is-stale' : ''}`}>
      <header className="panel__head">
        <h2>{recommended ? recommended.title : 'Допустимые варианты'}</h2>
        <div className="result__actions">
          {isRerunning ? (
            <span className="badge badge--neutral">предыдущий результат</span>
          ) : null}
          {recommended ? <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onEdit(recommended.calculation)}
            disabled={isRerunning}
          >
            Изменить вручную
          </button> : null}
        </div>
      </header>

      {/* Живая область создана заранее и пустует: сообщение, вставленное в уже
          существующий role="status", скринридер читает, а внезапно появившийся
          элемент — далеко не всегда. */}
      <div className="result__status" role="status">
        {isRerunning ? (
          <p className="state state--loading">
            Идёт новый подбор. Ниже — результат предыдущего поиска; к изменённым
            настройкам он не относится.
          </p>
        ) : null}
      </div>

      {recommended ? (
        <>
          <p className="selection selection--lead">
            {selectionLabel(recommended.calculation.selection)}
          </p>
          <p className="panel__muted">{recommended.reason}</p>
        </>
      ) : (
        <p className="panel__muted">
          Варианты найдены. Портфель команды не входит в результаты этого поиска.
          Выберите один из вариантов ниже для просмотра и проверки.
        </p>
      )}

      <SearchStats result={result} />

      {alternatives.length > 0 ? (
        <>
          <h3 className="panel__subhead">Альтернативы</h3>
          <ul className="alternatives">
            {alternatives.map((variant) => (
              <li key={variant.calculation.input_hash}>
                <strong>{variant.title}</strong>
                <span className="selection">
                  {selectionLabel(variant.calculation.selection)}
                </span>
                <span className="panel__muted">{variant.reason}</span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => onEdit(variant.calculation)}
                  disabled={isRerunning}
                >
                  Открыть вариант
                </button>
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
  calculation, isPending, isError, scenario, selectionLabelText, origin, onReset, fallbackChecks,
}: {
  calculation: Calculation | undefined
  isPending: boolean
  isError: boolean
  scenario: Scenario
  selectionLabelText: string
  origin: 'empty' | 'manual' | 'copy'
  onReset: () => void
  fallbackChecks: number
}) {
  const checks = calculation?.checks[scenario]
  /* Числа на экране не относятся к текущему выбору в двух случаях: пересчёт
     ещё идёт или он упал. Оба помечаются одинаково — приглушением И словом. */
  const isStale = isPending || isError

  return (
    <div className="result">
      <div className="result__head">
        <p className="selection selection--lead">{selectionLabelText}</p>
        <div className="result__actions">
          {origin === 'copy' ? (
            <span className="badge badge--neutral">копия рекомендации</span>
          ) : null}
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            Очистить
          </button>
        </div>
      </div>

      {/* Живая область стоит ДО чисел и существует всегда.
          До чисел — потому что предупреждение «показанное неактуально» после
          таблицы приходит уже опоздавшим. Всегда — потому что содержимое,
          вставленное в существующий role="status", скринридер объявляет. */}
      <div className="result__status" role="status">
        {isPending ? (
          <p className="state state--loading">Пересчитываем портфель…</p>
        ) : null}

        {isError && !isPending ? (
          <p className="state state--error">
            Пересчёт не удался. Показанные ниже числа относятся к предыдущему выбору
            и текущему портфелю не соответствуют.
          </p>
        ) : null}
      </div>

      <div className={isStale ? 'result__body is-stale' : 'result__body'} aria-busy={isPending}>
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
              <p className="state state--error">
                Проверки по сценарию {scenario} не пришли от backend.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
