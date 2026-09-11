import { RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'

import { LotCard, RecommendedLotCard, useLotDetails } from '@entities/case'
import { formatMoney, selectionKey, useSavedVariants, useWorkspace } from '@entities/portfolio'
import {
  CompareDialog, SaveVariantDialog, SearchStats, StressSwitch, buildCandidates, defaultVariant,
  useActiveVariant, useAutoRecommendation, useManualRecommendation,
} from '@features'
import type { CaseCatalog, RecommendationResult } from '@shared/api/contracts'
import { Button, Panel, SectionHeading, Skeleton, Tag } from '@shared/ui'
import {
  Alternatives, ExplanationBlock, LotDetailsHost, PortfolioReview, type AlternativeTarget,
} from '@widgets'

import { HowWeChoose } from './howWeChoose'

type Props = {
  catalog: CaseCatalog
}

const TILTS = [-2, -0.6, 0.6, 2]

/**
 * Экран «Автоподбор».
 *
 * Алгоритм перебирает 5670 конфигураций, отбрасывает нарушающие ограничения и
 * оставляет фронт. Сверху — портфель команды (если он на фронте) или первая
 * опорная точка; ниже — проверка, объяснение и остальные опорные точки.
 * Получение результата само по себе не означает, что команда приняла его решением.
 */
export function AutoScreen({ catalog }: Props) {
  const { query, launched, conditionChanged, searchRequireStress, launch } = useAutoRecommendation(catalog.dataset_hash)
  const manual = useManualRecommendation(catalog.dataset_hash)
  const result = query.data
  const active = useActiveVariant(catalog.dataset_hash, result)

  const scenario = useWorkspace((state) => state.scenario)
  const openVariant = useWorkspace((state) => state.openVariant)
  const startManualFrom = useWorkspace((state) => state.startManualFrom)
  const setRequireStress = useWorkspace((state) => state.setRequireStress)
  const savedItems = useSavedVariants((state) => state.items)
  const openDetails = useLotDetails((state) => state.open)

  const [saveOpen, setSaveOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)

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

  const top = defaultVariant(result)
  const activeTarget: AlternativeTarget | null =
    active.kind === 'team' ? 'team' : active.kind === 'reference' ? (active.alternativeIndex ?? null) : null

  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col items-center gap-5">
        <SectionHeading
          as="h1"
          eyebrow="Профиль"
          title={method?.title ?? 'Подбор портфеля'}
          description="Алгоритм перебирает комбинации из четырёх уникальных лотов и режимов A/B/C, отбрасывает нарушающие ограничения и оставляет недоминируемые. Выбор одной точки фронта — решение команды, а не результат вычисления."
        />
        {method ? <HowWeChoose method={method} /> : null}
        <StressSwitch />
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
            Это сбой запроса, а не результат расчёта: допустимость портфелей не проверена, и делать
            вывод «подходящих вариантов нет» по этой ошибке нельзя.
          </p>
          <Button className="mt-5" onClick={launch}>Повторить</Button>
        </Panel>
      ) : null}

      {result?.status === 'no_feasible' ? (
        <NoFeasibleBlock
          result={result}
          isRerunning={query.isFetching}
          onSearchInBase={() => {
            setRequireStress(false)
            launch()
          }}
          onManual={() => {
            startManualFrom([])
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      ) : null}

      {result?.status === 'ok' && top ? (
        <section className="rise-in flex flex-col items-center gap-8" aria-busy={query.isFetching}>
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="text-[24px] leading-tight font-bold tracking-[-0.015em]">
              {top.kind === 'team' ? 'Портфель команды' : `Опорная точка фронта: ${top.variant.title}`}
            </h2>
            <p className="max-w-[560px] text-[13.5px] leading-snug text-muted">
              {top.kind === 'team'
                ? 'Лежит на фронте недоминируемых вариантов и выбран командой по правилу из управленческой записки. Остальные опорные точки фронта — ниже.'
                : 'Портфель команды не лежит на фронте при этих условиях поиска, поэтому показана крайняя точка фронта. Остальные опорные точки — ниже.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Tag tone="muted" size="md">условие поиска: {searchRequireStress ? 'проходят STRESS' : 'проходят BASE'}</Tag>
              {conditionChanged ? (
                <Tag tone="warn" size="md">условие изменено — нажмите «Подобрать заново»</Tag>
              ) : null}
              {query.isFetching ? <Tag tone="brand" size="md">идёт новый подбор…</Tag> : null}
            </div>
          </div>

          <ul className={`grid w-full max-w-[1180px] gap-6 sm:grid-cols-2 lg:grid-cols-4 ${query.isFetching ? 'is-stale' : ''}`}>
            {top.variant.calculation.detail.map((detail, index) => {
              const lot = lotById.get(detail.lot_id)
              if (!lot) return null
              return (
                <li key={detail.lot_id} className="flex">
                  <RecommendedLotCard
                    lot={lot}
                    modeId={detail.mode_id}
                    modeLabel={top.kind === 'team' ? 'Выбран командой · режим' : 'Режим'}
                    onDetails={openDetails}
                    formatMoney={formatMoney}
                    tilt={TILTS[index] ?? 0}
                  />
                </li>
              )
            })}
          </ul>

          <SearchStats result={result} />

          <Button onClick={launch} loading={query.isFetching}>
            <RotateCcw className="size-4" aria-hidden />
            Подобрать заново
          </Button>
        </section>
      ) : null}

      {/* Сохранённый вариант открывается и без запущенного автоподбора: блок просмотра
          нужен ему сам по себе, а веер и опорные точки — только результату перебора. */}
      {(result?.status === 'ok' && top) || active.kind === 'saved' ? (
        <>
          <PortfolioReview
            catalog={catalog}
            calculation={active.calculation}
            variantKind={active.kind}
            variantTitle={active.title}
            isDefault={active.isDefault}
            reason={active.reason}
            isLoading={active.isLoading}
            isError={active.isError}
            onRetry={active.retry}
            onBackToDefault={result?.status === 'ok' ? () => openVariant({ kind: 'default' }) : undefined}
            onSave={() => setSaveOpen(true)}
            onCompare={() => setCompareOpen(true)}
            onEditManually={() => {
              if (!active.calculation) return
              startManualFrom(active.calculation.selection.map((item) => item.lot_id))
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />

          <ExplanationBlock datasetHash={catalog.dataset_hash} calculation={active.calculation} scenario={scenario} />
        </>
      ) : null}

      {result?.status === 'ok' ? (
        <Alternatives
          className="rise-in"
          title="Альтернативы и сравнение"
          subtitle="Опорные точки фронта — крайние значения по каждому показателю среди недоминируемых вариантов. Это границы возможного, а не то, что следует выбрать."
          result={result}
          active={activeTarget}
          onOpen={(target) =>
            openVariant(target === 'team' ? { kind: 'default' } : { kind: 'alternative', index: target })
          }
        />
      ) : null}

      {active.calculation ? (
        <SaveVariantDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          calculation={active.calculation}
          source={active.kind}
          defaultName={active.title}
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
          Сравним варианты из {catalog.lots.length} лотов и покажем фронт: портфель команды и опорные точки.
        </p>
      </div>

      <section className="flex w-full flex-col items-center gap-6">
        <SectionHeading title="Восемь лотов кейса" description="Все лоты участвуют в поиске. Числа на карточках — исходные значения каталога, без коэффициентов режима." />
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
        При выбранных условиях (поиск среди проходящих {result.request.require_stress ? 'STRESS' : 'BASE'})
        допустимый портфель не найден.
      </p>
      <SearchStats result={result} className="mt-4" />
      <p className="mx-auto mt-4 max-w-[520px] text-[13px] leading-snug text-muted">
        {canSearchInBase
          ? `${result.base_count} конфигураций проходят BASE, но ни одна не выдерживает сокращение бюджета. «Искать в BASE» меняет условие поиска: найденный портфель проверку STRESS не проходил.`
          : `Ни одна из ${result.considered_count} конфигураций не проходит даже BASE. Ограничения не ослабляем и «наименее плохой» вариант допустимым не показываем.`}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {canSearchInBase ? (
          <Button onClick={onSearchInBase} loading={isRerunning}>Искать в BASE</Button>
        ) : null}
        <Button variant="secondary" onClick={onManual}>Собрать вручную</Button>
      </div>
    </Panel>
  )
}
