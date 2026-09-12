import { useState, type FormEvent } from 'react'

import { PORTFOLIO_SIZE, formatNumber, useWorkspace, type SearchSettings as Settings } from '@entities/portfolio'
import type { CaseCatalog } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Button, Collapsible, Panel, TextField } from '@shared/ui'

type Props = {
  catalog: CaseCatalog
  className?: string
}

/** Пустое поле — условие не задано; число в запрос уходит как есть. */
function parseOptional(value: string): number | null {
  return value === '' ? null : Number(value)
}

/** Короткая сводка для свёрнутого блока: «по умолчанию» или список заданных условий. */
function describeSettings(settings: Settings): string {
  const parts: string[] = []
  if (settings.cashLossLimit !== null) parts.push(`Δ ≤ ${formatNumber(settings.cashLossLimit)}`)
  if (settings.budgetCap !== null) parts.push(`C0 ≤ ${formatNumber(settings.budgetCap)}`)
  if (settings.vpubFloor !== null) parts.push(`VPUB ≥ ${formatNumber(settings.vpubFloor)}`)
  if (settings.publicLotIds.length > 0) parts.push(`ядро: ${settings.publicLotIds.join(', ')}`)
  return parts.length > 0 ? parts.join(' · ') : 'по умолчанию'
}

function isSame(a: Settings, b: Settings): boolean {
  return (
    a.cashLossLimit === b.cashLossLimit &&
    a.budgetCap === b.budgetCap &&
    a.vpubFloor === b.vpubFloor &&
    a.publicLotIds.join('|') === b.publicLotIds.join('|')
  )
}

/**
 * Правило выбора и дополнительные условия поиска (бриф: Δ, лимит запуска,
 * минимум общественной ценности, обязательное общественное ядро).
 *
 * Черновик живёт локально и попадает в стор только по «Применить» — иначе
 * каждая цифра в поле перезапускала бы подбор. Ограничения кейса действуют
 * всегда; пустое поле ничего не добавляет.
 */
export function SearchSettings({ catalog, className }: Props) {
  const settings = useWorkspace((state) => state.searchSettings)
  const apply = useWorkspace((state) => state.setSearchSettings)
  const [draft, setDraft] = useState<Settings>(settings)
  const [error, setError] = useState('')
  const dirty = !isSame(draft, settings)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.cashLossLimit !== null && (!Number.isFinite(draft.cashLossLimit) || draft.cashLossLimit < 0)) {
      setError('Δ — конечное неотрицательное число.')
      return
    }
    if (draft.publicLotIds.length > PORTFOLIO_SIZE) {
      setError(`Общественными можно назначить не более ${PORTFOLIO_SIZE} лотов.`)
      return
    }
    apply(draft)
    setError('')
  }

  function toggleLot(lotId: string) {
    setDraft((current) => ({
      ...current,
      publicLotIds: current.publicLotIds.includes(lotId)
        ? current.publicLotIds.filter((id) => id !== lotId)
        : [...current.publicLotIds, lotId].sort(),
    }))
  }

  return (
    <Panel className={cn('w-full', className)}>
      <Collapsible
        title={<span className="text-[15px] font-semibold">Правило выбора и дополнительные условия</span>}
        summary={describeSettings(settings)}
      >
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <p className="max-w-[880px] text-[12.5px] leading-snug text-muted">
            Правило: в пределах допустимой потери остатка Δ выбирается портфель с наилучшей слабой из шести
            оценок; при равенстве — больший остаток S. Ограничения кейса действуют всегда, поля ниже — условия
            команды: пустое поле ничего не добавляет.
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            <TextField
              label="Допустимая потеря остатка Δ, млн ₽ / год"
              hint="Пусто — минимальная потеря S, при которой достижимо лучшее Q"
              name="cash-loss-limit"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="автоматически"
              value={draft.cashLossLimit ?? ''}
              onChange={(event) => setDraft({ ...draft, cashLossLimit: parseOptional(event.target.value) })}
            />
            <TextField
              label="Лимит запуска C0, млн ₽"
              hint="Пусто — лимит выбранного сценария"
              name="budget-cap"
              type="number"
              inputMode="decimal"
              min={0.01}
              step="any"
              placeholder="лимит сценария"
              value={draft.budgetCap ?? ''}
              onChange={(event) => setDraft({ ...draft, budgetCap: parseOptional(event.target.value) })}
            />
            <TextField
              label="Минимум общественной ценности, млн ₽ / год"
              hint="Пусто — минимум из условий кейса"
              name="vpub-floor"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="минимум кейса"
              value={draft.vpubFloor ?? ''}
              onChange={(event) => setDraft({ ...draft, vpubFloor: parseOptional(event.target.value) })}
            />
          </div>

          <fieldset>
            <legend className="text-[13px] font-medium text-ink-700">Обязательно в общественном ядре</legend>
            <p className="mt-0.5 text-[12px] text-muted">
              До {PORTFOLIO_SIZE} лотов; в ручной проверке они должны входить в выбранный состав.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {catalog.lots.map((lot) => {
                const checked = draft.publicLotIds.includes(lot.lot_id)
                return (
                  <button
                    key={lot.lot_id}
                    type="button"
                    aria-pressed={checked}
                    title={lot.title}
                    onClick={() => toggleLot(lot.lot_id)}
                    className={cn(
                      'h-[28px] rounded-full border border-white px-3.5 text-[12px] font-semibold backdrop-blur-[8px]',
                      'transition-[background-color,color,box-shadow] duration-200 ease-(--ease-soft)',
                      checked ? 'bg-brand text-white shadow-brand' : 'bg-card text-ink/60 shadow-chip hover:text-ink',
                    )}
                  >
                    {lot.lot_id}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="md" disabled={!dirty}>Применить условия</Button>
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => {
                  setDraft(settings)
                  setError('')
                }}
              >
                Отменить
              </Button>
            ) : null}
            {error ? <p role="alert" className="text-[12.5px] text-fail">{error}</p> : null}
          </div>
        </form>
      </Collapsible>
    </Panel>
  )
}
