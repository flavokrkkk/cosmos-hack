import { ArrowCounterClockwise } from '@phosphor-icons/react'
import { Suspense, useMemo, useState } from 'react'

import { LotCard, RecommendedLotCard, useLotDetails } from '@entities/case'
import { formatMoney, selectionKey, useSavedVariants, useWorkspace } from '@entities/portfolio'
import {
  CalculationInputsControl, SearchStats, StressSwitch, buildCandidates, useActiveVariant, useAutoRecommendation,
  useManualRecommendation, usePrefetchRecommendation,
} from '@features'
import { normalizeApiError } from '@shared/api'
import type { CaseCatalog, RecommendationResult } from '@shared/api/contracts'
import { Button, Panel, SectionHeading, Skeleton, Tag } from '@shared/ui'
import {
  Alternatives, ExplanationBlock, LotDetailsHost, PortfolioReview, type AlternativeTarget,
} from '@widgets'

import { LazyCompareDialog, LazyEditPortfolioDialog, LazySaveVariantDialog, preloadActionDialogs } from './lazyDialogs'

type Props = {
  catalog: CaseCatalog
  officialCatalog: CaseCatalog
}

const TILTS = [-2, -0.6, 0.6, 2]

/** Первое предложение — заголовку хватает сути, полный текст остаётся в подсказке. */
function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/)
  return match ? match[0] : text
}

/**
 * Экран «Автоподбор».
 *
 * Алгоритм перебирает 5670 конфигураций, отбрасывает нарушающие ограничения и
 * оставляет фронт. Карточки, проверка и объяснение показывают один открытый вариант.
 * Получение результата само по себе не означает, что команда приняла его решением.
 */
export function AutoScreen({ catalog, officialCatalog }: Props) {
  usePrefetchRecommendation(catalog.dataset_hash)
  const auto = useAutoRecommendation(catalog.dataset_hash)
  const { query, explanations, launched, searchRequireStress, launch } = auto
  const manual = useManualRecommendation(catalog.dataset_hash)
  const result = query.data
  const active = useActiveVariant(catalog.dataset_hash, result)

  const openVariant = useWorkspace((state) => state.openVariant)
  const startManualFrom = useWorkspace((state) => state.startManualFrom)
  const setRequireStress = useWorkspace((state) => state.setRequireStress)
  const calculationInputs = useWorkspace((state) => state.calculationInputs)
  const savedItems = useSavedVariants((state) => state.items)
  const openDetails = useLotDetails((state) => state.open)

  const [saveOpen, setSaveOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  /* Диалог монтируется при первом открытии и дальше остаётся: так работает анимация закрытия. */
  const [saveMounted, setSaveMounted] = useState(false)
  const [compareMounted, setCompareMounted] = useState(false)
  const [editMounted, setEditMounted] = useState(false)
  const openEditor = () => {
    setEditMounted(true)
    setEditOpen(true)
  }

  const lotById = useMemo(() => new Map(catalog.lots.map((lot) => [lot.lot_id, lot])), [catalog.lots])

  const candidates = useMemo(
    () => buildCandidates({ datasetHash: catalog.dataset_hash, auto: result, manual: manual.query.data, saved: savedItems,
      custom: active.kind === 'custom' ? active.calculation : undefined }),
    [catalog.dataset_hash, result, manual.query.data, savedItems, active.kind, active.calculation],
  )
  /* Что отмечено при открытии сравнения: открытый вариант и портфель команды. */
  const compareInitial = useMemo(() => {
    const ids = [
      active.calculation ? selectionKey(active.calculation.selection) : null,
      result?.recommended ? selectionKey(result.recommended.calculation.selection) : null,
    ]
    return [...new Set(ids.filter((id): id is string => Boolean(id)))]
  }, [active.calculation, result])

  const isDirectVariant = active.kind === 'saved' || active.kind === 'custom'
  const showPortfolio = (launched && result?.status === 'ok' && Boolean(active.calculation)) || isDirectVariant
  const isUpdating = isDirectVariant ? active.isLoading : query.isFetching
  const activeTarget: AlternativeTarget | null =
    active.kind === 'team' ? 'team' : active.kind === 'reference' ? (active.alternativeIndex ?? null) : null

  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col items-center gap-4">
        <SectionHeading
          as="h1"
          title="Подбор портфеля"
        />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <StressSwitch />
          <CalculationInputsControl officialCatalog={officialCatalog} />
        </div>
        {!showPortfolio ? (
          <Button
            variant="secondary"
            aria-label="Проверить точный портфель из четырёх лотов с заданными режимами"
            onClick={openEditor}
          >
            Проверить свои 4 лота
          </Button>
        ) : null}
      </div>

      {!launched && !isDirectVariant ? (
        <LaunchBlock catalog={catalog} onLaunch={launch} isRunning={query.isFetching} onDetails={openDetails} />
      ) : null}

      {launched && query.isPending && !isDirectVariant ? <LoadingBlock /> : null}

      {launched && query.isError && !query.isPending && !isDirectVariant ? (
        <Panel className="mx-auto w-full max-w-[720px] text-center">
          <h2 className="text-[20px] font-bold">Подбор не выполнен</h2>
          <p className="mt-2 text-[14px] text-fail">{query.error.message}</p>
          <Button className="mt-5" onClick={launch}>Повторить</Button>
        </Panel>
      ) : null}

      {launched && result?.status === 'no_feasible' && !isDirectVariant ? (
        <>
        <NoFeasibleBlock
          result={result}
          isRerunning={query.isFetching}
          onSearchInBase={() => setRequireStress(false)}
          onManual={() => {
            startManualFrom([])
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
        </>
      ) : null}

      {showPortfolio && active.calculation ? (
        <section id="active-portfolio" className="rise-in flex scroll-mt-6 flex-col items-center gap-8" aria-busy={isUpdating}>
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="text-[24px] leading-tight font-bold tracking-[-0.015em]">
              {active.title}
            </h2>
            {active.kind === 'saved' && active.reason ? (
              <p className="max-w-[560px] text-[13.5px] leading-snug text-muted" title={active.reason}>
                {firstSentence(active.reason)}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {!isDirectVariant ? (
                <Tag tone="muted" size="md">условие поиска: {searchRequireStress ? 'проходят STRESS' : 'проходят BASE'}</Tag>
              ) : null}
              {isUpdating ? <Tag tone="brand" size="md">обновляем расчёт…</Tag> : null}
            </div>
          </div>

          <ul className={`grid w-full max-w-[1180px] gap-4 sm:grid-cols-2 lg:grid-cols-4 ${isUpdating ? 'is-stale' : ''}`}>
            {active.calculation.detail.map((detail, index) => {
              const lot = lotById.get(detail.lot_id)
              if (!lot) return null
              return (
                <li key={detail.lot_id} className="flex">
                  <RecommendedLotCard
                    lot={lot}
                    detail={detail}
                    modeId={detail.mode_id}
                    modeLabel={active.kind === 'custom' ? 'Выбранный режим' : 'Подобранный режим'}
                    onDetails={openDetails}
                    formatMoney={formatMoney}
                    tilt={TILTS[index] ?? 0}
                  />
                </li>
              )
            })}
          </ul>

          {result && !isDirectVariant ? <SearchStats result={result} /> : null}

          <Button onClick={launch} loading={query.isFetching}>
            <ArrowCounterClockwise className="size-4" weight="bold" aria-hidden />
            Подобрать заново
          </Button>
        </section>
      ) : null}

      {/* Сохранённый вариант открывается и без запущенного автоподбора: блок просмотра
          нужен ему сам по себе, а веер и опорные точки — только результату перебора. */}
      {showPortfolio ? (
        <>
          <PortfolioReview
            recommendation={result}
            catalog={catalog}
            calculation={active.calculation}
            variantKind={active.kind}
            variantTitle={active.title}
            isDefault={active.isDefault}
            reason={active.reason}
            isLoading={isUpdating}
            isError={active.isError}
            onRetry={active.retry}
            onBackToDefault={result?.status === 'ok' ? () => {
              if (launched) openVariant({ kind: 'default' })
              else launch()
            } : undefined}
            onSave={() => {
              setSaveMounted(true)
              setSaveOpen(true)
            }}
            onCompare={() => {
              setCompareMounted(true)
              setCompareOpen(true)
            }}
            onActionsIntent={preloadActionDialogs}
            onEditManually={openEditor}
          />

          {!isDirectVariant ? (
          <ExplanationBlock
            result={auto.explanationFor(active.calculation?.input_hash)}
            isLoading={explanations.isFetching}
            errorMessage={explanations.isError ? normalizeApiError(explanations.error).message : undefined}
            onRetry={() => void explanations.refetch()}
          />
          ) : null}
        </>
      ) : null}

      {launched && result?.status === 'ok' ? (
        <Alternatives
          className="rise-in"
          title="Альтернативы и сравнение"
          result={result}
          active={activeTarget}
          onOpen={(target) => {
            openVariant(target === 'team' ? { kind: 'default' } : { kind: 'alternative', index: target })
            document.getElementById('active-portfolio')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />
      ) : null}

      <Suspense fallback={null}>
        {saveMounted && active.calculation ? (
          <LazySaveVariantDialog
            open={saveOpen}
            onOpenChange={setSaveOpen}
            calculation={active.calculation}
            source={active.kind === 'custom' ? 'manual' : active.kind}
            defaultName={active.title}
            engineVersion={catalog.engine_version}
          />
        ) : null}

        {compareMounted ? (
          <LazyCompareDialog
            open={compareOpen}
            onOpenChange={setCompareOpen}
            datasetHash={catalog.dataset_hash}
            inputs={calculationInputs}
            candidates={candidates}
            initialIds={compareInitial}
          />
        ) : null}
        {editMounted ? (
          <LazyEditPortfolioDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            catalog={catalog}
            selection={showPortfolio ? active.calculation?.selection ?? [] : []}
          />
        ) : null}
      </Suspense>

      <LotDetailsHost catalog={catalog} calculation={active.calculation} />
    </div>
  )
}

function LaunchBlock({
  catalog, onLaunch, isRunning, onDetails,
}: {
  catalog: CaseCatalog
  onLaunch: () => void
  isRunning: boolean
  onDetails: (lotId: string) => void
}) {
  return (
    <div className="flex flex-col items-center gap-10">
      <div className="flex flex-col items-center gap-3">
        <Button onClick={onLaunch} loading={isRunning} className="h-[52px] px-8 text-[16px]">
          Подобрать портфель
        </Button>
      </div>

      <section className="flex w-full flex-col items-center gap-6">
        <SectionHeading title="Восемь лотов кейса" />
        <ul className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {catalog.lots.map((lot) => (
            <li key={lot.lot_id} className="flex">
              <LotCard lot={lot} onDetails={onDetails} formatMoney={formatMoney} className="w-full" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function LoadingBlock() {
  return (
    <section className="flex flex-col items-center gap-8" role="status" aria-live="polite">
      <div className="text-center">
        <h2 className="text-[24px] font-bold tracking-[-0.015em]">Подбираем портфель…</h2>
      </div>
      <ul className="grid w-full max-w-[1180px] gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <li key={index}>
            <Skeleton className="h-[262px] rounded-card" />
          </li>
        ))}
      </ul>
    </section>
  )
}

function NoFeasibleBlock({
  result, isRerunning, onSearchInBase, onManual,
}: {
  result: RecommendationResult
  isRerunning: boolean
  onSearchInBase: () => void
  onManual: () => void
}) {
  /*
   * Отсутствие допустимого варианта — законный результат расчёта, а не ошибка и
   * не пустой портфель 0/4. Условия сами не ослабляем: единственное предлагаемое
   * действие — явный поиск в BASE, и только когда он вообще имеет смысл.
   */
  const canSearchInBase = result.request.require_stress && result.base_count > 0
  return (
    <Panel className="mx-auto w-full max-w-[720px] text-center">
      <h2 className="text-[22px] font-bold tracking-[-0.01em]">Допустимого портфеля нет</h2>
      <p className="mt-2 text-[14px] text-ink-500">
        Нет варианта, который проходит {result.request.require_stress ? 'STRESS' : 'BASE'} и все заданные параметры поиска.
      </p>
      <SearchStats result={result} className="mt-4" />
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {canSearchInBase ? (
          <Button onClick={onSearchInBase} loading={isRerunning}>Искать в BASE</Button>
        ) : null}
        <Button variant="secondary" onClick={onManual}>Собрать вручную</Button>
      </div>
    </Panel>
  )
}
