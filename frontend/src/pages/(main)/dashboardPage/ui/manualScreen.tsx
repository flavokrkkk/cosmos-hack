import { Suspense, useMemo, useState } from 'react'

import { LotCard, useLotDetails } from '@entities/case'
import {
  ConstraintTiles, ExtraMetrics, FeasibilityBadge, LotChip, METRIC_TILES, METRIC_TILES_COMPACT,
  MetricTiles, PORTFOLIO_SIZE, PortfolioProgress, FinancialBreakdown, checkLabel, formatCheckValue, formatMoney,
  scenarioDependentCodes, useEvaluate, useSavedVariants, useWorkspace,
} from '@entities/portfolio'
import {
  CalculationInputsControl, ExportButton, SearchStats, StressSwitch, buildCandidates, useActiveVariant,
  useAutoRecommendation, useManualRecommendation, useManualSelection, useUniformModeDiagnostics,
  type UniformModeDiagnostic,
} from '@features'
import { normalizeApiError } from '@shared/api'
import type { CaseCatalog, RecommendationResult, Scenario } from '@shared/api/contracts'
import { SCENARIOS } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Button, Collapsible, Panel, PanelHeader, PanelTitle, Segmented, Skeleton, Tag } from '@shared/ui'
import {
  Alternatives, ExplanationBlock, LotDetailsHost, type AlternativeTarget,
} from '@widgets'

import { LazyCompareDialog, LazyEditPortfolioDialog, LazySaveVariantDialog, preloadActionDialogs } from './lazyDialogs'

type Props = {
  catalog: CaseCatalog
  officialCatalog: CaseCatalog
}

const SCENARIO_OPTIONS = SCENARIOS.map((scenario) => ({ value: scenario, label: scenario }))

/**
 * Экран «Ручная проверка».
 *
 * Пользователь выбирает 4–8 кандидатов; сервер ищет среди них итоговую
 * четвёрку с режимами A/B/C. Добавление или удаление кандидата обновляет
 * подбор. BASE/STRESS меняет только пороги проверки открытого портфеля.
 */
export function ManualScreen({ catalog, officialCatalog }: Props) {
  const selection = useManualSelection()
  const manualRecommendation = useManualRecommendation(catalog.dataset_hash)
  const { query, explanations } = manualRecommendation
  const auto = useAutoRecommendation(catalog.dataset_hash)
  const result = query.data
  const active = useActiveVariant(catalog.dataset_hash, result)

  const scenario = useWorkspace((state) => state.scenario)
  const setScenario = useWorkspace((state) => state.setScenario)
  const setRequireStress = useWorkspace((state) => state.setRequireStress)
  const openVariant = useWorkspace((state) => state.openVariant)
  const savedItems = useSavedVariants((state) => state.items)
  const openDetails = useLotDetails((state) => state.open)

  const [saveOpen, setSaveOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  /* Диалог монтируется при первом открытии и дальше остаётся: так работает анимация закрытия. */
  const [saveMounted, setSaveMounted] = useState(false)
  const [compareMounted, setCompareMounted] = useState(false)
  const [editMounted, setEditMounted] = useState(false)

  const lotById = useMemo(() => new Map(catalog.lots.map((lot) => [lot.lot_id, lot])), [catalog.lots])

  /*
   * 1–3 лота: режимов ещё нет, поэтому денег не показываем. Но структурные
   * условия (число лотов, территории, группы возможностей) от режима не зависят —
   * их считает тот же бэкенд через evaluate с техническим режимом-заглушкой
   * (режим общественного ядра). Пользователю режим не показывается.
   */
  const placeholderMode = catalog.modes.find((mode) => mode.public_core)?.mode_id ?? catalog.modes[0]?.mode_id ?? 'A'
  const partialSelection = useMemo(
    () => selection.lotIds.map((lotId) => ({ lot_id: lotId, mode_id: placeholderMode })),
    [selection.lotIds, placeholderMode],
  )
  const calculationInputs = useWorkspace((state) => state.calculationInputs)
  const partial = useEvaluate(
    catalog.dataset_hash, partialSelection, selection.count > 0 && !selection.isComplete, calculationInputs,
  )

  /* Диагностика одинаковых режимов относится только к одному составу из четырёх лотов. */
  const noFeasible = selection.isComplete && query.data?.status === 'no_feasible'
  const uniform = useUniformModeDiagnostics(
    catalog.dataset_hash, selection.lotIds, catalog.modes, noFeasible && selection.count === PORTFOLIO_SIZE,
    calculationInputs,
  )

  const candidates = useMemo(
    () => buildCandidates({ datasetHash: catalog.dataset_hash, auto: auto.query.data, manual: result, saved: savedItems }),
    [catalog.dataset_hash, auto.query.data, result, savedItems],
  )
  const compareInitial = useMemo(() => {
    const ids = [
      active.calculation ? active.calculation.input_hash : null,
      auto.query.data?.recommended ? auto.query.data.recommended.calculation.input_hash : null,
    ]
    return [...new Set(ids.filter((id): id is string => Boolean(id)))]
  }, [active.calculation, auto.query.data])

  const complete = selection.isComplete
  const showResult = complete && result?.status === 'ok' && active.calculation
  const activeTarget: AlternativeTarget | null =
    active.kind === 'team' ? 'team' : active.kind === 'reference' ? (active.alternativeIndex ?? null) : null

  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col gap-6">
        <header className="grid items-center gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-[24px] leading-tight font-bold">Выберите сервисные лоты</h1>
            <Tag size="md" tone="neutral" aria-live="polite">
              {selection.count ? `${selection.count} из ${selection.maximum} · минимум ${selection.minimum}` : 'Все лоты'}
            </Tag>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <Segmented
              size="sm"
              value={scenario}
              onChange={(value: Scenario) => setScenario(value)}
              options={SCENARIO_OPTIONS}
              label="Сценарий проверки: меняет только пороги"
            />
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.68fr)_minmax(340px,1fr)] lg:items-start">
          <ul className="grid content-start gap-4 sm:grid-cols-2">
            {catalog.lots.map((lot) => (
              <li key={lot.lot_id} className="flex">
                <LotCard
                  lot={lot}
                  state={selection.stateOf(lot.lot_id)}
                  onToggle={selection.toggle}
                  onDetails={openDetails}
                  formatMoney={formatMoney}
                  className="w-full"
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            <Panel>
              <PanelHeader className="mb-3">
                <PanelTitle className="text-[20px]">Лоты для подбора</PanelTitle>
                {selection.count > 0 ? (
                  <Button variant="ghost" size="sm" onClick={selection.clear}>Очистить</Button>
                ) : null}
              </PanelHeader>

              {selection.count === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted">Подбор по всем лотам. Выберите лоты слева, чтобы сузить поиск.</p>
              ) : (
                <>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {selection.lotIds.map((lotId) => {
                      const lot = lotById.get(lotId)
                      return (
                        <li key={lotId}>
                          <LotChip
                            lotId={lotId}
                            title={lot?.title ?? lotId}
                            onRemove={selection.remove}
                            onClick={openDetails}
                            className="min-w-0"
                          />
                        </li>
                      )
                    })}
                  </ul>
                  {!complete ? (
                    <p className="mt-3 text-[12.5px] text-muted">
                      Выберите ещё {selection.remaining}, чтобы начать подбор
                    </p>
                  ) : null}
                  {!complete && partial.data ? (
                    <PortfolioProgress calculation={partial.data} scenario={scenario} className="mt-4" />
                  ) : null}
                </>
              )}
              {complete ? <StressSwitch compact className="mt-4 justify-between" /> : null}
            </Panel>

            {complete && query.isPending ? (
              <Panel aria-busy role="status">
                <Collapsible defaultOpen title="Показатели" summary={<Tag tone="brand">подбираем портфель…</Tag>}>
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[76px]" />)}
                  </div>
                </Collapsible>
                <Collapsible title="Проверка ограничений" className="mt-2 border-t border-line/70 pt-2">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {Array.from({ length: 9 }, (_, index) => <Skeleton key={index} className="h-[76px]" />)}
                  </div>
                </Collapsible>
              </Panel>
            ) : null}

            {complete && query.isError && !query.isPending ? (
              <Panel>
                <PanelTitle className="text-[20px]">Подбор портфеля не выполнен</PanelTitle>
                <p className="mt-2 text-[13.5px] text-fail">{query.error.message}</p>
                <Button className="mt-4" size="md" onClick={() => void query.refetch()}>Повторить</Button>
              </Panel>
            ) : null}

            {complete && result?.status === 'no_feasible' ? (
              <NoFeasibleBlock
                result={result}
                diagnostics={uniform.diagnostics}
                alwaysFailing={uniform.alwaysFailing(scenario)}
                scenario={scenario}
                onSearchInBase={() => setRequireStress(false)}
              />
            ) : null}

            {showResult && active.calculation?.metrics ? (
              <div className="rise-in flex flex-col gap-5">
                <Panel className={cn(query.isFetching && 'is-stale')} aria-busy={query.isFetching}>
                  <PanelHeader className="mb-3">
                    <PanelTitle className="text-[20px]">Текущий портфель</PanelTitle>
                    <Tag tone="brand">{active.calculation.selection.length} из {selection.count || catalog.lots.length}</Tag>
                  </PanelHeader>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {active.calculation.selection.map((item) => (
                      <li key={item.lot_id}>
                        <LotChip
                          lotId={item.lot_id}
                          title={lotById.get(item.lot_id)?.title ?? item.lot_id}
                          modeId={item.mode_id}
                          onClick={openDetails}
                          className="min-w-0"
                        />
                      </li>
                    ))}
                  </ul>
                </Panel>
                <Panel
                  className={cn('[&_.shadow-tile]:shadow-none', query.isFetching && 'is-stale')}
                  aria-busy={query.isFetching}
                >
                  <Collapsible
                    defaultOpen
                    title="Показатели"
                    summary={<FeasibilityBadge calculation={active.calculation} scenario={scenario} size="sm" />}
                  >
                    {active.kind === 'reference' || active.kind === 'team' ? (
                      <p className="mb-3 text-[12.5px] text-muted">
                        {active.kind === 'team' ? 'Рекомендация алгоритма' : `Опорная точка: ${active.title}`} · сценарий {scenario}
                      </p>
                    ) : null}
                    <MetricTiles metrics={active.calculation.metrics} tiles={METRIC_TILES_COMPACT} columns={2} />
                    <ExtraMetrics
                      metrics={active.calculation.metrics}
                      shown={METRIC_TILES_COMPACT}
                      rest={METRIC_TILES.filter((tile) => !METRIC_TILES_COMPACT.includes(tile))}
                      className="mt-4"
                    />
                    <FinancialBreakdown financial={active.calculation.financial} />
                  </Collapsible>

                  <Collapsible title="Проверка ограничений" className="mt-2 border-t border-line/70 pt-2">
                    {active.calculation.checks[scenario] ? (
                      <ConstraintTiles
                        checks={active.calculation.checks[scenario]}
                        scenarioDependent={scenarioDependentCodes(active.calculation)}
                        scenario={scenario}
                      />
                    ) : null}
                  </Collapsible>
                </Panel>

                <div className="grid grid-cols-2 items-center gap-2 [&_button]:px-2 [&_button]:text-[12px]" onMouseEnter={preloadActionDialogs} onFocus={preloadActionDialogs}>
                  <Button
                    onClick={() => {
                      setSaveMounted(true)
                      setSaveOpen(true)
                    }}
                  >
                    Сохранить вариант
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCompareMounted(true)
                      setCompareOpen(true)
                    }}
                  >
                    Сравнить
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 [&_button]:px-2 [&_button]:text-[12px]" onMouseEnter={preloadActionDialogs} onFocus={preloadActionDialogs}>
              <CalculationInputsControl officialCatalog={officialCatalog} />
              <Button variant="secondary" onClick={() => { setEditMounted(true); setEditOpen(true) }}>
                Задать лоты и режимы
              </Button>
              <ExportButton calculation={showResult ? active.calculation : undefined} catalog={catalog} recommendation={result} />
            </div>
          </div>
        </div>
      </div>

      {showResult && result ? (
        <div className="rise-in flex flex-col gap-14">
          <ExplanationBlock
            result={manualRecommendation.explanationFor(active.calculation?.input_hash)}
            isLoading={explanations.isFetching}
            errorMessage={explanations.isError ? normalizeApiError(explanations.error).message : undefined}
            onRetry={() => void explanations.refetch()}
          />
          <Alternatives
            title="Другие варианты из выбранных лотов"
            result={result}
            active={activeTarget}
            onOpen={(target) => {
              openVariant(target === 'team' ? { kind: 'default' } : { kind: 'alternative', index: target })
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </div>
      ) : null}

      <Suspense fallback={null}>
        {saveMounted && active.calculation ? (
          <LazySaveVariantDialog
            open={saveOpen}
            onOpenChange={setSaveOpen}
            calculation={active.calculation}
            source="manual"
            defaultName={`Ручной: ${active.calculation.selection.map((item) => item.lot_id).join(' + ')}`}
            engineVersion={catalog.engine_version}
          />
        ) : null}

        {compareMounted ? (
          <LazyCompareDialog
            open={compareOpen}
            onOpenChange={setCompareOpen}
            datasetHash={catalog.dataset_hash}
            candidates={candidates}
            initialIds={compareInitial}
          />
        ) : null}
        {editMounted ? (
          <LazyEditPortfolioDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            catalog={catalog}
          />
        ) : null}
      </Suspense>

      <LotDetailsHost catalog={catalog} calculation={active.calculation} />
    </div>
  )
}

/**
 * Нет допустимой четвёрки среди кандидатов. Для единственного состава из
 * четырёх лотов дополнительно показываем диагностику одинаковых режимов.
 */
function NoFeasibleBlock({
  result, diagnostics, alwaysFailing, scenario, onSearchInBase,
}: {
  result: RecommendationResult
  diagnostics: UniformModeDiagnostic[]
  alwaysFailing: string[]
  scenario: Scenario
  onSearchInBase: () => void
}) {
  const canSearchInBase = result.request.require_stress && result.base_count > 0
  const hasSingleComposition = result.request.lot_ids?.length === PORTFOLIO_SIZE
  const [modeId, setModeId] = useState(diagnostics[0]?.mode.mode_id ?? 'A')
  const current = diagnostics.find((item) => item.mode.mode_id === modeId) ?? diagnostics[0]
  const checks = current?.calculation?.checks[scenario]
  /* Для каждого блокера — лучшее значение среди режимов: у «≤» минимум, у «≥» максимум. */
  const blockers = alwaysFailing.flatMap((code) => {
    const variants = diagnostics
      .map((item) => item.calculation?.checks[scenario]?.find((check) => check.code === code))
      .filter((check): check is NonNullable<typeof check> => Boolean(check))
    if (variants.length === 0) return []
    const best = variants.reduce((acc, check) =>
      (check.operator === '<=' ? check.actual < acc.actual : check.actual > acc.actual) ? check : acc,
    )
    return [best]
  })

  return (
    <>
      <Panel>
        <PanelTitle className="text-[20px]">Допустимого портфеля нет</PanelTitle>
        <p className="mt-2 text-[13.5px] leading-snug text-ink-500">
          Среди выбранных лотов не найден вариант, который проходит
          {result.request.require_stress ? ' STRESS' : ' BASE'} и все заданные параметры поиска.
          Измените параметры или состав кандидатов.
        </p>
        <SearchStats result={result} className="mt-3 justify-start" />
        {canSearchInBase ? (
          <Button size="sm" className="mt-4" onClick={onSearchInBase}>Искать без условия STRESS</Button>
        ) : null}
      </Panel>

      {hasSingleComposition ? <Panel>
        <PanelHeader className="mb-2">
          <PanelTitle className="text-[20px]">Что мешает</PanelTitle>
          {current?.calculation ? <FeasibilityBadge calculation={current.calculation} scenario={scenario} size="sm" /> : null}
        </PanelHeader>
        {blockers.length > 0 ? (
          <p className="mb-3 text-[13px] leading-snug text-ink-700">
            Нарушения, общие для проверенных одинаковых режимов; лучшее значение среди них:{' '}
            {blockers.map((check, index) => (
              <span key={check.code} className="tabular-nums">
                {index > 0 ? '; ' : ''}
                <strong>{checkLabel(check).split(',')[0]}</strong> {formatCheckValue(check)}
              </span>
            ))}
            .
          </p>
        ) : (
          <p className="mb-3 text-[13px] leading-snug text-muted">
            У проверенных одинаковых режимов нет общего нарушения условий кейса.
            Проверьте также дополнительные параметры поиска.
          </p>
        )}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12.5px] text-muted">Проверить состав, если у всех лотов режим</span>
          <Segmented
            size="sm"
            value={modeId}
            onChange={setModeId}
            options={diagnostics.map((item) => ({ value: item.mode.mode_id, label: item.mode.mode_id }))}
            label="Режим для всех лотов в диагностике"
          />
        </div>
        {checks && current?.calculation ? (
          <ConstraintTiles
            checks={checks}
            scenarioDependent={scenarioDependentCodes(current.calculation)}
            scenario={scenario}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy>
            {Array.from({ length: 9 }, (_, index) => <Skeleton key={index} className="h-[76px]" />)}
          </div>
        )}
      </Panel> : null}
    </>
  )
}
