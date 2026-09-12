import { ArrowLeft } from '@phosphor-icons/react'

import { useLotDetails } from '@entities/case'
import {
  ConstraintTiles, ExtraMetrics, FeasibilityBadge, METRIC_TILES, MetricTiles, PortfolioLotCard,
  scenarioDependentCodes, useWorkspace,
} from '@entities/portfolio'
import { ExportButton } from '@features'
import type { AccessMode, Calculation, CaseCatalog, Lot, Scenario } from '@shared/api/contracts'
import { SCENARIOS } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Button, Panel, PanelHeader, PanelTitle, Segmented, Skeleton, Tag } from '@shared/ui'

import { describeComposition } from './describeComposition'

type Props = {
  catalog: CaseCatalog
  calculation: Calculation | undefined
  /** Что именно открыто: портфель команды, опорная точка фронта или сохранённый вариант. */
  variantKind: 'team' | 'reference' | 'saved'
  variantTitle: string
  /** Открыт вариант по умолчанию — тот же, что показан карточками сверху. */
  isDefault: boolean
  /** Правило, по которому вариант получен, — вторая строка описания. */
  reason: string
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
  /** Вернуться к варианту по умолчанию (портфелю команды). */
  onBackToDefault?: () => void
  onSave: () => void
  onCompare: () => void
  onEditManually?: () => void
}

const SCENARIO_OPTIONS = SCENARIOS.map((scenario) => ({ value: scenario, label: scenario }))

/**
 * «Текущий портфель» + «Проверка этого портфеля» + «Проверка ограничений».
 *
 * Переключатель BASE/STRESS здесь меняет ТОЛЬКО пороги проверки: состав,
 * режимы и цены лотов те же. Исходные и пересчитанные числа подписаны
 * раздельно — на карточке лота видно «исходное × коэффициент = после режима».
 */
export function PortfolioReview({
  catalog, calculation, variantKind, variantTitle, isDefault, reason, isLoading, isError, onRetry,
  onBackToDefault, onSave, onCompare, onEditManually,
}: Props) {
  const scenario = useWorkspace((state) => state.scenario)
  const setScenario = useWorkspace((state) => state.setScenario)
  const openDetails = useLotDetails((state) => state.open)

  const lotById = new Map<string, Lot>(catalog.lots.map((lot) => [lot.lot_id, lot]))
  const modeById = new Map<string, AccessMode>(catalog.modes.map((mode) => [mode.mode_id, mode]))

  const complete = calculation?.status === 'complete' && calculation.metrics !== null
  const checks = calculation?.checks[scenario]
  const dependent = calculation ? scenarioDependentCodes(calculation) : undefined

  return (
    <div className="rise-in flex flex-col gap-6">
    {/* Две колонки одной высоты, как на макете: панель тянется, карточки внутри — нет. */}
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel aria-busy={isLoading} className={cn('flex flex-col', isLoading && 'is-stale')}>
        <PanelHeader className="mb-2 items-start">
          <div>
            <PanelTitle>Текущий портфель</PanelTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Tag tone={variantKind === 'team' ? 'brand' : 'muted'} size="md">
                {variantKind === 'team'
                  ? 'Выбран командой'
                  : variantKind === 'saved'
                    ? `Сохранённый вариант: ${variantTitle}`
                    : `Опорная точка фронта: ${variantTitle}`}
              </Tag>
              {!isDefault && onBackToDefault ? (
                <Button variant="link" size="sm" onClick={onBackToDefault}>
                  <ArrowLeft className="size-3.5" weight="bold" aria-hidden />
                  К портфелю команды
                </Button>
              ) : null}
            </div>
          </div>
        </PanelHeader>

        {calculation?.detail.length ? (
          <p className="mb-4 max-w-[640px] text-[13px] leading-snug text-muted" title={reason || undefined}>
            {describeComposition(calculation.detail)}
          </p>
        ) : null}

        {isError ? (
          <div className="rounded-card bg-fail-bg px-5 py-4 text-[13.5px] text-fail">
            Пересчёт не удался.{' '}
            {onRetry ? (
              <button type="button" className="font-semibold underline" onClick={onRetry}>
                Повторить
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="grid content-start gap-4 sm:grid-cols-2">
          {calculation
            ? calculation.detail.map((detail) => {
                const lot = lotById.get(detail.lot_id)
                const mode = modeById.get(detail.mode_id)
                if (!lot || !mode) return null
                return (
                  <PortfolioLotCard
                    key={detail.lot_id}
                    lot={lot}
                    mode={mode}
                    detail={detail}
                    onDetails={openDetails}
                  />
                )
              })
            : [0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[236px] rounded-card" />)}
        </div>
      </Panel>

      <div className="flex flex-col gap-6">
        <Panel aria-busy={isLoading} className={cn(isLoading && 'is-stale')}>
          <PanelHeader>
            <PanelTitle>Проверка этого портфеля</PanelTitle>
            <Segmented
              size="sm"
              value={scenario}
              onChange={(value: Scenario) => setScenario(value)}
              options={SCENARIO_OPTIONS}
              label="Сценарий проверки: меняет только пороги"
            />
          </PanelHeader>
          {complete && calculation.metrics ? (
            <MetricTiles metrics={calculation.metrics} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((index) => <Skeleton key={index} className="h-[76px]" />)}
            </div>
          )}
        </Panel>

        <Panel aria-busy={isLoading} className={cn(isLoading && 'is-stale')}>
          <PanelHeader>
            <PanelTitle>Проверка ограничений</PanelTitle>
            {complete && calculation ? <FeasibilityBadge calculation={calculation} scenario={scenario} size="sm" /> : null}
          </PanelHeader>
          {checks ? (
            <ConstraintTiles checks={checks} scenarioDependent={dependent} scenario={scenario} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 9 }, (_, index) => <Skeleton key={index} className="h-[76px]" />)}
            </div>
          )}
        </Panel>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Button onClick={onSave} disabled={!complete}>Сохранить вариант</Button>
          <Button variant="secondary" onClick={onCompare} disabled={!complete}>Сравнить</Button>
          {onEditManually ? (
            <Button variant="secondary" onClick={onEditManually} disabled={!complete} className="col-span-2 sm:col-span-1">
              Изменить вручную
            </Button>
          ) : null}
        </div>

        <div className="-mt-3">
          <ExportButton calculation={calculation} catalog={catalog} />
        </div>
      </div>
    </div>

    {/* Подробности — отдельной строкой под колонками: раскрытие не меняет их высоту. */}
    {complete && calculation.metrics ? (
      <Panel className="px-4 py-2">
        <ExtraMetrics metrics={calculation.metrics} shown={METRIC_TILES} />
      </Panel>
    ) : null}
    </div>
  )
}
