import { useState } from 'react'

import { PORTFOLIO_SIZE, useWorkspace } from '@entities/portfolio'
import type { CaseCatalog, SelectionItem } from '@shared/api/contracts'
import { Button, Dialog, DialogClose, DialogContent, Segmented, Tag } from '@shared/ui'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: CaseCatalog
  selection: readonly SelectionItem[]
}

/** Здесь задаётся точный итоговый вариант; алгоритм не заменяет выбранные режимы. */
export function EditPortfolioDialog({ open, onOpenChange, catalog, selection }: Props) {
  const openCustomVariant = useWorkspace((state) => state.openCustomVariant)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Проверить точный портфель">
        {open ? (
          <EditForm
            catalog={catalog}
            selection={selection}
            onApply={(items) => {
              openCustomVariant(items)
              onOpenChange(false)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ catalog, selection, onApply }: {
  catalog: CaseCatalog
  selection: readonly SelectionItem[]
  onApply: (selection: SelectionItem[]) => void
}) {
  const [items, setItems] = useState<SelectionItem[]>(() => selection
    .filter((item, index) => catalog.lots.some((lot) => lot.lot_id === item.lot_id)
      && catalog.modes.some((mode) => mode.mode_id === item.mode_id)
      && selection.findIndex((other) => other.lot_id === item.lot_id) === index)
    .slice(0, PORTFOLIO_SIZE)
    .map((item) => ({ ...item })))
  const modeOptions = catalog.modes.map((mode) => ({ value: mode.mode_id, label: mode.mode_id }))
  const full = items.length === PORTFOLIO_SIZE

  return (
    <form onSubmit={(event) => {
      event.preventDefault()
      if (full) onApply(items)
    }} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-medium">Выберите {PORTFOLIO_SIZE} лота и режим для каждого</p>
        <Tag size="md" aria-live="polite">{items.length} из {PORTFOLIO_SIZE}</Tag>
      </div>
      <ul className="flex flex-col gap-2">
        {catalog.lots.map((lot) => {
          const selected = items.find((item) => item.lot_id === lot.lot_id)
          return (
            <li key={lot.lot_id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white bg-white/40 px-4 py-3">
              <label className="flex min-h-10 min-w-0 flex-[1_1_200px] cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(selected)}
                  disabled={!selected && full}
                  className="size-5 shrink-0 accent-brand"
                  onChange={(event) => {
                    const checked = event.target.checked
                    setItems((current) => checked
                      ? current.length < PORTFOLIO_SIZE
                        ? [...current, { lot_id: lot.lot_id, mode_id: modeOptions[0]?.value ?? 'A' }]
                        : current
                      : current.filter((item) => item.lot_id !== lot.lot_id))
                  }}
                />
                <span className="min-w-0 text-[14px] font-medium break-words">{lot.title} · {lot.lot_id}</span>
              </label>
              {selected ? (
                <Segmented
                  size="sm"
                  className="ml-auto"
                  value={selected.mode_id}
                  options={modeOptions}
                  label={`Режим лота ${lot.title}`}
                  onChange={(modeId) => setItems((current) => current.map((item) =>
                    item.lot_id === lot.lot_id ? { ...item, mode_id: modeId } : item))}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <DialogClose asChild><Button variant="ghost">Отмена</Button></DialogClose>
        <Button type="submit" disabled={!full}>Проверить вариант</Button>
      </div>
    </form>
  )
}
