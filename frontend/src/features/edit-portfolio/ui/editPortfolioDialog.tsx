import { useState } from 'react'

import { PORTFOLIO_SIZE, useWorkspace } from '@entities/portfolio'
import type { CaseCatalog } from '@shared/api/contracts'
import { Button, Dialog, DialogClose, DialogContent, Tag } from '@shared/ui'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: CaseCatalog
}

/** Ограничения области поиска; итоговые лоты и режимы выбирает алгоритм. */
export function EditPortfolioDialog({ open, onOpenChange, catalog }: Props) {
  const lotIds = useWorkspace((state) => state.manualLotIds)
  const allowedModes = useWorkspace((state) => state.manualAllowedModes)
  const applySearchOptions = useWorkspace((state) => state.applySearchOptions)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Лоты и режимы">
        {open ? <EditForm catalog={catalog} initialLotIds={lotIds} initialModes={allowedModes}
          onApply={(ids, modes) => {
            applySearchOptions(ids, modes)
            onOpenChange(false)
          }} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ catalog, initialLotIds, initialModes, onApply }: {
  catalog: CaseCatalog
  initialLotIds: string[]
  initialModes: Record<string, string[]>
  onApply: (lotIds: string[], modes: Record<string, string[]>) => void
}) {
  const [lotIds, setLotIds] = useState(() => initialLotIds.filter((id) => catalog.lots.some((lot) => lot.lot_id === id)))
  const [modes, setModes] = useState(() => structuredClone(initialModes))
  const valid = lotIds.length === 0 || lotIds.length >= PORTFOLIO_SIZE
  return (
    <form onSubmit={(event) => {
      event.preventDefault()
      if (valid) onApply(lotIds, Object.fromEntries(Object.entries(modes)
        .filter(([lot, values]) => values.length && (!lotIds.length || lotIds.includes(lot)))))
    }} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-medium">Лоты для подбора</p>
        <Tag size="md">{lotIds.length ? `${lotIds.length} из ${catalog.lots.length}` : 'Все лоты'}</Tag>
      </div>
      <p className="text-[13px] text-muted">
        Пустой выбор — все лоты и режимы A/B/C. Можно разрешить несколько режимов для каждого лота.
        Алгоритм выберет четыре лота и один режим для каждого.
      </p>
      <ul className="flex flex-col gap-2">
        {catalog.lots.map((lot) => {
          const selected = lotIds.includes(lot.lot_id)
          const available = !lotIds.length || selected
          const allowed = modes[lot.lot_id] ?? []
          return (
            <li key={lot.lot_id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white bg-white/40 px-4 py-3">
              <label className="flex min-h-10 min-w-0 flex-[1_1_200px] cursor-pointer items-center gap-3">
                <input type="checkbox" checked={selected} className="size-5 shrink-0 accent-brand"
                  onChange={() => setLotIds((current) => selected
                    ? current.filter((id) => id !== lot.lot_id) : [...current, lot.lot_id])} />
                <span className="min-w-0 text-[14px] font-medium break-words">{lot.title} · {lot.lot_id}</span>
              </label>
              <div role="group" aria-label={`Разрешённые режимы: ${lot.title}`} className="ml-auto flex items-center gap-1">
                {!allowed.length ? <span className="mr-1 text-[12px] text-muted">Все</span> : null}
                {catalog.modes.map((mode) => (
                  <Button key={mode.mode_id} size="sm" disabled={!available}
                    variant={allowed.includes(mode.mode_id) ? 'primary' : 'secondary'}
                    aria-pressed={allowed.includes(mode.mode_id)}
                    aria-label={`${lot.lot_id}: режим ${mode.mode_id}`}
                    onClick={() => setModes((current) => ({ ...current, [lot.lot_id]: allowed.includes(mode.mode_id)
                      ? allowed.filter((id) => id !== mode.mode_id) : [...allowed, mode.mode_id].sort() }))}>
                    {mode.mode_id}
                  </Button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      {!valid ? <p role="status" className="text-[13px] text-muted">Выберите минимум четыре лота или сбросьте выбор для полного подбора.</p> : null}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => { setLotIds([]); setModes({}) }}>Сбросить</Button>
        <DialogClose asChild><Button variant="ghost">Отмена</Button></DialogClose>
        <Button type="submit" disabled={!valid}>Подобрать портфель</Button>
      </div>
    </form>
  )
}
