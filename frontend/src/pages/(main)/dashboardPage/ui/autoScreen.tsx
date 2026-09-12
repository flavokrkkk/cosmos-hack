import { ArrowCounterClockwise } from '@phosphor-icons/react'
import { Suspense, useMemo, useState } from 'react'

import { LotCard, RecommendedLotCard, useLotDetails } from '@entities/case'
import { formatMoney, selectionKey, useSavedVariants, useWorkspace } from '@entities/portfolio'
import {
  SearchSettings, SearchStats, StressSwitch, buildCandidates, useActiveVariant, useAutoRecommendation,
  useManualRecommendation, usePrefetchRecommendation,
} from '@features'
import { normalizeApiError } from '@shared/api'
import type { CaseCatalog, RecommendationResult } from '@shared/api/contracts'
import { Button, Panel, SectionHeading, Skeleton, Tag } from '@shared/ui'
import {
  Alternatives, DecisionAnalysis, ExplanationBlock, LotDetailsHost, PortfolioReview, type AlternativeTarget,
} from '@widgets'

import { LazyCompareDialog, LazySaveVariantDialog, preloadActionDialogs } from './lazyDialogs'

type Props = {
  catalog: CaseCatalog
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
export function AutoScreen({ catalog }: Props) {
  usePrefetchRecommendation(catalog.dataset_hash)
  const auto = useAutoRecommendation(catalog.dataset_hash)
  const { query, explanations, launched, searchRequireStress, launch } = auto
  const manual = useManualRecommendation(catalog.dataset_hash)
  const result = query.data
  const active = useActiveVariant(catalog.dataset_hash, result)

  const openVariant = useWorkspace((state) => state.openVariant)
  const startManualFrom = useWorkspace((state) => state.startManualFrom)
  const setRequireStress = useWorkspace((state) => state.setRequireStress)
  const savedItems = useSavedVariants((state) => state.items)
  const openDetails = useLotDetails((state) => state.open)

  const [saveOpen, setSaveOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  /* Диалог монтируется при первом открытии и дальше остаётся: так работает анимация закрытия. */
  const [saveMounted, setSaveMounted] = useState(false)
  const [compareMounted, setCompareMounted] = useState(false)

  const method = catalog.methods[0]
  const lotById = useMemo(() => new Map(catalog.lots.map((lot) => [lot.lot_id, lot])), [catalog.lots])

  const candidates = useMemo(
    () => buildCandidates({ datasetHash: catalog.dataset_hash, auto: result, manual: manual.query.data, saved: savedItems }),
    [catalog.dataset_hash, result, manual.query.data, savedItems],
  )
  /* Что отмечено при открытии сравнения: открытый вариант и портфель команды. */
  const compareInitial = useMemo(() => {
    const ids = [
      active.calculation ? selectionKey(active.calculation.selection) : null,
      result?.recommended ? selectionKey(result.recommended.calculation.selection) : null,
    ]
    return [...new Set(ids.filter((id): id is string => Boolean(id)))]
  }, [active.calculation, result])

  const showPortfolio = (result?.status === 'ok' && Boolean(active.calculation)) || active.kind === 'saved'
  const activeTarget: AlternativeTarget | null =
    active.kind === 'team' ? 'team' : active.kind === 'reference' ? (active.alternativeIndex ?? null) : null

  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col items-center gap-5">
        <SectionHeading
          as="h1"
          eyebrow="Профиль"
          title={method?.title ?? 'Подбор портфеля'}
          description={method?.description}
        />
        <StressSwitch />
        <SearchSettings catalog={catalog} />
      </div>

      {!launched ? (
        <LaunchBlock catalog={catalog} onLaunch={launch} isRunning={query.isFetching} onDetails={openDetails} />
      ) : null}

      {launched && query.isPending ? <LoadingBlock /> : null}

      {launched && query.isError && !query.isPending ? (
        <Panel className="mx-auto w-full max-w-[720px] text-center">
          <h2 className="text-[20px] font-bold">Подбор не выполнен</h2>
          <p className="mt-2 text-[14px] text-fail">{query.error.message}</p>
          <p className="mt-2 text-[13px] text-muted">
            Это сбой запроса, а не результат расчёта: вывод «подходящих вариантов нет» по нему делать нельзя.
          </p>
          <Button className="mt-5" onClick={launch}>Повторить</Button>
        </Panel>
      ) : null}

      {result?.status === 'no_feasible' ? (
        <NoFeasibleBlock
          result={result}
          isRerunning={query.isFetching}
          onSearchInBase={() => setRequireStress(false)}
          onManual={() => {
            startManualFrom([])
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      ) : null}

      {showPortfolio && active.calculation ? (
        <section id="active-portfolio" className="rise-in flex scroll-mt-6 flex-col items-center gap-8" aria-busy={query.isFetching}>
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="text-[24px] leading-tight font-bold tracking-[-0.015em]">
              {active.title}
            </h2>
            {active.kind !== 'team' && active.reason ? (
              <p className="max-w-[560px] text-[13.5px] leading-snug text-muted" title={active.reason}>
                {firstSentence(active.reason)}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {active.kind !== 'saved' ? (
                <Tag tone="muted" size="md">условие поиска: {searchRequireStress ? 'проходят STRESS' : 'проходят BASE'}</Tag>
              ) : null}
              {query.isFetching ? <Tag tone="brand" size="md">идёт новый подбор…</Tag> : null}
            </div>
          </div>

          <ul className={`grid w-full max-w-[1180px] gap-6 sm:grid-cols-2 lg:grid-cols-4 ${query.isFetching ? 'is-stale' : ''}`}>
            {active.calculation.detail.map((detail, index) => {
              const lot = lotById.get(detail.lot_id)
              if (!lot) return null
              return (
                <li key={detail.lot_id} className="flex">
                  <RecommendedLotCard
                    lot={lot}
                    detail={detail}
                    modeId={detail.mode_id}
                    modeLabel="Подобранный режим"
                    onDetails={openDetails}
                    formatMoney={formatMoney}
                    tilt={TILTS[index] ?? 0}
                  />
                </li>
              )
            })}
          </ul>

          {result ? <SearchStats result={result} /> : null}

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
            isLoading={query.isFetching || active.isLoading}
            isError={active.isError}
            onRetry={active.retry}
            onBackToDefault={result?.status === 'ok' ? () => openVariant({ kind: 'default' }) : undefined}
            onSave={() => {
              setSaveMounted(true)
              setSaveOpen(true)
            }}
            onCompare={() => {
              setCompareMounted(true)
              setCompareOpen(true)
            }}
            onActionsIntent={preloadActionDialogs}
            onEditManually={() => {
              if (!active.calculation) return
              startManualFrom(active.calculation.selection.map((item) => item.lot_id))
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />

          <ExplanationBlock
            result={auto.explanationFor(active.calculation?.input_hash)}
            isLoading={explanations.isFetching}
            errorMessage={explanations.isError ? normalizeApiError(explanations.error).message : undefined}
            onRetry={() => void explanations.refetch()}
          />
        </>
      ) : null}

      {result?.status === 'ok' ? (
        <Alternatives
          className="rise-in"
          title="Альтернативы и сравнение"
          subtitle="Результаты двух правил выбора и крайние компромиссы на одинаковых условиях. Можно открыть любой вариант и сравнить его показатели."
          result={result}
          active={activeTarget}
          onOpen={(target) => {
            openVariant(target === 'team' ? { kind: 'default' } : { kind: 'alternative', index: target })
            document.getElementById('active-portfolio')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />
      ) : null}

      {result ? <DecisionAnalysis analysis={result.analysis} catalog={catalog} /> : null}

      <Suspense fallback={null}>
        {saveMounted && active.calculation ? (
          <LazySaveVariantDialog
            open={saveOpen}
            onOpenChange={setSaveOpen}
            calculation={active.calculation}
            source={active.kind}
            defaultName={active.title}
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
        <p className="text-[13px] text-muted">
          Сравним варианты из {catalog.lots.length} лотов по выбранному правилу, покажем альтернативы и чувствительность решения.
        </p>
      </div>

      <section className="flex w-full flex-col items-center gap-6">
        <SectionHeading title="Восемь лотов кейса" />
        <ul className="grid w-full gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
        <p className="mt-2 text-[13.5px] text-muted">Перебираем конфигурации и проверяем ограничения</p>
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
        Среди проходящих {result.request.require_stress ? 'STRESS' : 'BASE'} допустимых конфигураций не найдено.
      </p>
      <SearchStats result={result} className="mt-4" />
      {canSearchInBase ? (
        <p className="mx-auto mt-4 max-w-[520px] text-[13px] leading-snug text-muted">
          {result.base_count} конфигураций проходят BASE. «Искать в BASE» меняет условие: такой портфель
          проверку STRESS не проходил.
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {canSearchInBase ? (
          <Button onClick={onSearchInBase} loading={isRerunning}>Искать в BASE</Button>
        ) : null}
        <Button variant="secondary" onClick={onManual}>Собрать вручную</Button>
      </div>
    </Panel>
  )
}
