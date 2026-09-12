import { Suspense, useMemo, useState } from 'react'

import { LotCard, useLotDetails } from '@entities/case'
import {
  ConstraintTiles, ExtraMetrics, FeasibilityBadge, LotChip, METRIC_TILES, METRIC_TILES_COMPACT,
  MetricTiles, PortfolioProgress, FinancialBreakdown, checkLabel, formatCheckValue, formatMoney,
  scenarioDependentCodes, selectionKey, useEvaluate, useSavedVariants, useWorkspace,
} from '@entities/portfolio'
import {
  ExportButton, SearchSettings, SearchStats, StressSwitch, buildCandidates, useActiveVariant,
  useAutoRecommendation, useManualRecommendation, useManualSelection, useUniformModeDiagnostics,
  type UniformModeDiagnostic,
} from '@features'
import { normalizeApiError } from '@shared/api'
import type { CaseCatalog, RecommendationResult, Scenario } from '@shared/api/contracts'
import { SCENARIOS } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Button, Panel, PanelHeader, PanelTitle, Segmented, Skeleton, Tag } from '@shared/ui'
import {
  Alternatives, DecisionAnalysis, ExplanationBlock, LotDetailsHost, type AlternativeTarget,
} from '@widgets'

import { LazyCompareDialog, LazySaveVariantDialog, preloadActionDialogs } from './lazyDialogs'

type Props = {
  catalog: CaseCatalog
}

const SCENARIO_OPTIONS = SCENARIOS.map((scenario) => ({ value: scenario, label: scenario }))

/**
 * Экран «Ручная проверка».
 *
 * Пользователь выбирает четыре разных лота; режимы A/B/C назначает сервер
 * (план §14): как только выбран четвёртый лот, уходит подбор внутри этих
 * лотов, а справа появляются показатели и девять проверок. Переключатель
 * BASE/STRESS меняет только пороги проверки того же набора.
 */
export function ManualScreen({ catalog }: Props) {
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
  /* Диалог монтируется при первом открытии и дальше остаётся: так работает анимация закрытия. */
  const [saveMounted, setSaveMounted] = useState(false)
  const [compareMounted, setCompareMounted] = useState(false)

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
  const partial = useEvaluate(catalog.dataset_hash, partialSelection, selection.count > 0 && !selection.isComplete)

  /* 4/4 без допустимых режимов: диагностика с одним режимом у всех лотов — по разу на A, B и C (Т3). */
  const noFeasible = selection.isComplete && query.data?.status === 'no_feasible'
  const uniform = useUniformModeDiagnostics(catalog.dataset_hash, selection.lotIds, catalog.modes, noFeasible)
  const modeByLot = useMemo(
    () => new Map((active.calculation?.detail ?? []).map((item) => [item.lot_id, item.mode_id])),
    [active.calculation],
  )

  const candidates = useMemo(
    () => buildCandidates({ datasetHash: catalog.dataset_hash, auto: auto.query.data, manual: result, saved: savedItems }),
    [catalog.dataset_hash, auto.query.data, result, savedItems],
  )
  const compareInitial = useMemo(() => {
    const ids = [
      active.calculation ? selectionKey(active.calculation.selection) : null,
      auto.query.data?.recommended ? selectionKey(auto.query.data.recommended.calculation.selection) : null,
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
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-[24px] leading-tight font-bold tracking-[-0.015em]">Выберите сервисные лоты</h1>
            <Tag size="md" tone="neutral" aria-live="polite">
              {selection.count} из {selection.size}
            </Tag>
          </div>
          <Segmented
            size="sm"
            value={scenario}
            onChange={(value: Scenario) => setScenario(value)}
            options={SCENARIO_OPTIONS}
            label="Сценарий проверки: меняет только пороги"
          />
        </header>
        <SearchSettings catalog={catalog} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)] lg:items-start">
          <ul className="grid content-start gap-5 sm:grid-cols-2">
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

          <div className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
            <Panel>
              <PanelHeader className="mb-3">
                <PanelTitle className="text-[20px]">Текущий портфель</PanelTitle>
                {selection.count > 0 ? (
                  <Button variant="ghost" size="sm" onClick={selection.clear}>Очистить</Button>
                ) : null}
              </PanelHeader>

              {selection.count === 0 ? (
                <p className="py-8 text-center text-[13px] text-muted">Для продолжения выберите 4 лота слева</p>
              ) : (
                <>
                  <ul className="flex flex-wrap gap-2.5">
                    {selection.lotIds.map((lotId) => {
                      const lot = lotById.get(lotId)
                      return (
                        <li key={lotId}>
                          <LotChip
                            lotId={lotId}
                            title={lot?.title ?? lotId}
                            modeId={modeByLot.get(lotId)}
                            onRemove={selection.remove}
                            onClick={openDetails}
                          />
                        </li>
                      )
                    })}
                  </ul>
                  {!complete ? (
                    <p className="mt-3 text-[12.5px] text-muted">
                      Выберите ещё {selection.remaining} — режимы A/B/C подберёт сервер
                    </p>
                  ) : null}
                  {complete ? <StressSwitch compact className="mt-4 justify-between" /> : null}
                  {!complete && partial.data ? (
                    <PortfolioProgress calculation={partial.data} scenario={scenario} className="mt-4" />
                  ) : null}
                </>
              )}
            </Panel>

            {complete && query.isPending ? (
              <>
                <Panel aria-busy role="status">
                  <PanelHeader className="mb-3">
                    <PanelTitle className="text-[20px]">Показатели</PanelTitle>
                    <Tag tone="brand">подбираем режимы…</Tag>
                  </PanelHeader>
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[76px]" />)}
                  </div>
                </Panel>
                <Panel aria-busy>
                  <PanelTitle className="mb-3 text-[20px]">Проверка ограничений</PanelTitle>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {Array.from({ length: 9 }, (_, index) => <Skeleton key={index} className="h-[76px]" />)}
                  </div>
                </Panel>
              </>
            ) : null}

            {complete && query.isError && !query.isPending ? (
              <Panel>
                <PanelTitle className="text-[20px]">Подбор режимов не выполнен</PanelTitle>
                <p className="mt-2 text-[13.5px] text-fail">{query.error.message}</p>
                <Button className="mt-4" size="md" onClick={() => void query.refetch()}>Повторить</Button>
              </Panel>
            ) : null}

            {complete && result?.status === 'no_feasible' ? (
              <NoModesBlock
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
                    <PanelTitle className="text-[20px]">Показатели</PanelTitle>
                    <FeasibilityBadge calculation={active.calculation} scenario={scenario} size="sm" />
                  </PanelHeader>
                  {active.kind === 'reference' || active.kind === 'team' ? (
                    <p className="mb-3 text-[12.5px] text-muted">
                      {active.kind === 'team' ? 'Рекомендация алгоритма' : `Опорная точка: ${active.title}`} · сценарий {scenario}
                    </p>
                  ) : null}
                  <MetricTiles metrics={active.calculation.metrics} tiles={METRIC_TILES_COMPACT} columns={2} />
                  <FinancialBreakdown financial={active.calculation.financial} />
                  <ExtraMetrics
                    metrics={active.calculation.metrics}
                    shown={METRIC_TILES_COMPACT}
                    rest={METRIC_TILES.filter((tile) => !METRIC_TILES_COMPACT.includes(tile))}
                  />
                </Panel>

                <Panel className={cn(query.isFetching && 'is-stale')} aria-busy={query.isFetching}>
                  <PanelTitle className="mb-3 text-[20px]">Проверка ограничений</PanelTitle>
                  {active.calculation.checks[scenario] ? (
                    <ConstraintTiles
                      checks={active.calculation.checks[scenario]}
                      scenarioDependent={scenarioDependentCodes(active.calculation)}
                      scenario={scenario}
                    />
                  ) : null}
                </Panel>

                <div className="grid grid-cols-2 gap-3" onMouseEnter={preloadActionDialogs} onFocus={preloadActionDialogs}>
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
                <div className="-mt-2">
                  <ExportButton calculation={active.calculation} catalog={catalog} recommendation={result} />
                </div>
              </div>
            ) : null}
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
            title="Другие режимы для выбранных лотов"
            subtitle="Опорные точки фронта внутри выбранных четырёх лотов: те же лоты, другие сочетания режимов A/B/C."
            result={result}
            active={activeTarget}
            onOpen={(target) => {
              openVariant(target === 'team' ? { kind: 'default' } : { kind: 'alternative', index: target })
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
          <DecisionAnalysis analysis={result.analysis} catalog={catalog} />
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
      </Suspense>

      <LotDetailsHost catalog={catalog} calculation={active.calculation} />
    </div>
  )
}

/**
 * Допустимых режимов нет. Сервер перебрал все сочетания A/B/C для этих лотов —
 * ни одно не проходит девять условий. Чтобы эксперт видел «вариант с нарушением»
 * (Т3) и понимал, что именно мешает, ниже тот же состав считается с одним режимом
 * у всех лотов; режим выбирает сам пользователь, а условия, нарушенные при любом
 * из режимов, названы блокерами набора.
 */
function NoModesBlock({
  result, diagnostics, alwaysFailing, scenario, onSearchInBase,
}: {
  result: RecommendationResult
  diagnostics: UniformModeDiagnostic[]
  alwaysFailing: string[]
  scenario: Scenario
  onSearchInBase: () => void
}) {
  const canSearchInBase = result.request.require_stress && result.base_count > 0
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
        <PanelTitle className="text-[20px]">Сочетания режимов нет</PanelTitle>
        <p className="mt-2 text-[13.5px] leading-snug text-ink-500">
          Сервер перебрал все сочетания A/B/C для этих лотов — ни одно не проходит
          {result.request.require_stress ? ' STRESS' : ' BASE'}. Замените один из лотов.
        </p>
        <SearchStats result={result} className="mt-3 justify-start" />
        {canSearchInBase ? (
          <Button size="sm" className="mt-4" onClick={onSearchInBase}>Искать без условия STRESS</Button>
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader className="mb-2">
          <PanelTitle className="text-[20px]">Что мешает</PanelTitle>
          {current?.calculation ? <FeasibilityBadge calculation={current.calculation} scenario={scenario} size="sm" /> : null}
        </PanelHeader>
        {blockers.length > 0 ? (
          <p className="mb-3 text-[13px] leading-snug text-ink-700">
            Не проходит ни при одном сочетании режимов; лучший одинаковый режим даёт:{' '}
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
            При одинаковом режиме у всех лотов часть условий проходит, но сочетания, где проходят все девять, нет.
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
      </Panel>
    </>
  )
}
