import { useMemo, useState } from 'react'

import { LotCard, useLotDetails } from '@entities/case'
import {
  ConstraintTiles, ExtraMetrics, FeasibilityBadge, LotChip, METRIC_TILES, METRIC_TILES_COMPACT,
  MetricTiles, PortfolioProgress, ScenarioHeadroom, formatMoney, scenarioDependentCodes,
  selectionKey, useEvaluate, useSavedVariants, useWorkspace,
} from '@entities/portfolio'
import {
  CompareDialog, ExportButton, SaveVariantDialog, SearchStats, StressSwitch, buildCandidates,
  useActiveVariant, useAutoRecommendation, useManualRecommendation, useManualSelection,
} from '@features'
import type { CaseCatalog, RecommendationResult, Scenario } from '@shared/api/contracts'
import { SCENARIOS } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Button, Panel, PanelHeader, PanelTitle, Segmented, Skeleton, Tag } from '@shared/ui'
import {
  Alternatives, ExplanationBlock, LotDetailsHost, type AlternativeTarget,
} from '@widgets'

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
  const { query } = useManualRecommendation(catalog.dataset_hash)
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
          <ul className="grid gap-5 sm:grid-cols-2">
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
                  <p className="mt-3 text-[12.5px] text-muted">
                    {complete
                      ? 'Режимы A/B/C подбирает сервер: перебираются все сочетания внутри этих четырёх лотов.'
                      : `Выберите ещё ${selection.remaining} — режимы A/B/C подберёт сервер после четвёртого лота.`}
                    {selection.origin === 'copy' ? ' Состав скопирован из открытого варианта.' : ''}
                  </p>
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
              <NoModesBlock result={result} onSearchInBase={() => setRequireStress(false)} />
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
                      {active.kind === 'team' ? 'Портфель команды' : `Опорная точка: ${active.title}`} · сценарий {scenario}
                    </p>
                  ) : null}
                  <MetricTiles metrics={active.calculation.metrics} tiles={METRIC_TILES_COMPACT} columns={2} />
                  <ScenarioHeadroom calculation={active.calculation} scenario={scenario} className="mt-3" />
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

                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={() => setSaveOpen(true)}>Сохранить вариант</Button>
                  <Button variant="secondary" onClick={() => setCompareOpen(true)}>Сравнить</Button>
                </div>
                <div className="-mt-2">
                  <ExportButton calculation={active.calculation} catalog={catalog} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showResult && result ? (
        <div className="rise-in flex flex-col gap-14">
          <ExplanationBlock datasetHash={catalog.dataset_hash} calculation={active.calculation} scenario={scenario} />
          <Alternatives
            title="Другие режимы для выбранных лотов"
            subtitle="Опорные точки фронта внутри выбранных четырёх лотов: те же лоты, другие сочетания режимов A/B/C."
            result={result}
            active={activeTarget}
            onOpen={(target) =>
              openVariant(target === 'team' ? { kind: 'default' } : { kind: 'alternative', index: target })
            }
          />
        </div>
      ) : null}

      {active.calculation ? (
        <SaveVariantDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          calculation={active.calculation}
          source="manual"
          defaultName={`Ручной: ${active.calculation.selection.map((item) => item.lot_id).join(' + ')}`}
          engineVersion={catalog.engine_version}
        />
      ) : null}

      <CompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        datasetHash={catalog.dataset_hash}
        candidates={candidates}
        initialIds={compareInitial}
      />

      <LotDetailsHost catalog={catalog} calculation={active.calculation} />
    </div>
  )
}

function NoModesBlock({ result, onSearchInBase }: { result: RecommendationResult; onSearchInBase: () => void }) {
  const canSearchInBase = result.request.require_stress && result.base_count > 0
  return (
    <Panel>
      <PanelTitle className="text-[20px]">Сочетания режимов нет</PanelTitle>
      <p className="mt-2 text-[13.5px] leading-snug text-ink-500">
        Для выбранных лотов нет сочетания режимов, выполняющего требования
        {result.request.require_stress ? ' STRESS' : ' BASE'}. Состав не подменяем.
      </p>
      <SearchStats result={result} className="mt-3 justify-start" />
      <div className="mt-4 flex flex-wrap gap-2">
        {canSearchInBase ? (
          <Button size="sm" onClick={onSearchInBase}>Искать без условия STRESS</Button>
        ) : null}
        <span className="self-center text-[12.5px] text-muted">или замените один из лотов слева</span>
      </div>
    </Panel>
  )
}
