import { useState } from 'react'

import {
  changedInputCount, cloneCalculationInputs, officialCalculationInputs, useWorkspace,
} from '@entities/portfolio'
import type { AccessMode, CalculationInputs, CaseCatalog, Lot } from '@shared/api/contracts'
import { Button, Collapsible, Dialog, DialogClose, DialogContent, Segmented, Tag, TextField } from '@shared/ui'

type Props = { open: boolean; onOpenChange: (open: boolean) => void; officialCatalog: CaseCatalog }
type Tab = 'lots' | 'modes'

const LOT_NUMBERS: { key: keyof Lot; label: string; min: number; max?: number; step?: number }[] = [
  { key: 'c0_mrub', label: 'Вложения на запуск (C0), млн ₽', min: 0 },
  { key: 'opex_mrub_per_year', label: 'Расходы за год (OPEX), млн ₽', min: 0 },
  { key: 'anchor_cash_mrub_per_year', label: 'Якорные поступления, млн ₽/год', min: 0 },
  { key: 'commercial_cash_mrub_per_year', label: 'Коммерческие поступления, млн ₽/год', min: 0 },
  { key: 'vpub_mrub_per_year', label: 'Общественная ценность (VPUB), млн ₽/год', min: 0 },
  { key: 't_rep', label: 'Индекс t_rep', min: 0, max: 1, step: .01 },
  { key: 'readiness_1_5', label: 'Готовность (readiness_1_5)', min: 1, max: 5, step: .1 },
  { key: 'resilience_1_5', label: 'Устойчивость (resilience_1_5)', min: 1, max: 5, step: .1 },
  { key: 'scale_1_5', label: 'Тиражируемость (scale_1_5)', min: 1, max: 5, step: .1 },
]

const MODE_NUMBERS: { key: keyof AccessMode; label: string }[] = [
  { key: 'k_c0', label: 'Множитель запуска (k_c0)' },
  { key: 'k_opex', label: 'Множитель расходов (k_opex)' },
  { key: 'k_vpub', label: 'Множитель общественной ценности (k_vpub)' },
  { key: 'k_anchor', label: 'Множитель якорных поступлений (k_anchor)' },
  { key: 'k_commercial', label: 'Множитель коммерческих поступлений (k_commercial)' },
]

export function CalculationInputsDialog({ open, onOpenChange, officialCatalog }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" title="Исходные данные расчёта">
        {open ? <InputsForm officialCatalog={officialCatalog} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function InputsForm({ officialCatalog, onClose }: { officialCatalog: CaseCatalog; onClose: () => void }) {
  const current = useWorkspace((state) => state.calculationInputs)
  const apply = useWorkspace((state) => state.applyCalculationInputs)
  const official = officialCalculationInputs(officialCatalog)
  const [draft, setDraft] = useState<CalculationInputs>(() => cloneCalculationInputs(current ?? official))
  const [tab, setTab] = useState<Tab>('lots')
  const [error, setError] = useState<string | null>(null)
  const changed = changedInputCount(officialCatalog, draft)

  function updateLot(lotId: string, patch: Partial<Lot>) {
    setDraft((value) => ({ ...value, lots: value.lots.map((lot) => lot.lot_id === lotId ? { ...lot, ...patch } : lot) }))
  }

  function updateMode(modeId: string, patch: Partial<AccessMode>) {
    setDraft((value) => ({ ...value, modes: value.modes.map((mode) => mode.mode_id === modeId ? { ...mode, ...patch } : mode) }))
  }

  function validate(): string | null {
    for (const lot of draft.lots) {
      if (![lot.title, lot.service, lot.territorial_archetype, lot.territory_title].every((value) => value.trim())) {
        return `${lot.lot_id}: заполните текстовые поля.`
      }
      if (!lot.capability_groups.length || lot.capability_groups.some((value) => !value.trim())) {
        return `${lot.lot_id}: укажите хотя бы одну группу возможностей.`
      }
      for (const field of LOT_NUMBERS) {
        const value = lot[field.key]
        if (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || (field.max !== undefined && value > field.max)) {
          return `${lot.lot_id}: проверьте поле «${field.label}».`
        }
      }
    }
    for (const mode of draft.modes) {
      for (const field of MODE_NUMBERS) {
        const value = mode[field.key]
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          return `Режим ${mode.mode_id}: проверьте поле «${field.label}».`
        }
      }
    }
    return null
  }

  function submit() {
    const message = validate()
    if (message) { setError(message); return }
    apply(changed ? draft : null)
    onClose()
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={tab} onChange={setTab} label="Раздел исходных данных" options={[
          { value: 'lots', label: 'Лоты' }, { value: 'modes', label: 'Режимы A/B/C' },
        ]} />
        <Tag tone={changed ? 'brand' : 'muted'}>{changed ? `Изменено полей: ${changed}` : 'Официальные значения'}</Tag>
      </div>

      {tab === 'lots' ? (
        <div className="flex flex-col divide-y divide-line">
          {draft.lots.map((lot, index) => (
            <Collapsible key={lot.lot_id} defaultOpen={index === 0} title={`${lot.title} · ${lot.lot_id}`}>
              <div className="grid gap-4 pb-5 sm:grid-cols-2 lg:grid-cols-3">
                <TextField id={`lot-${lot.lot_id}-title`} label="Название" value={lot.title} onChange={(event) => updateLot(lot.lot_id, { title: event.target.value })} />
                <TextField id={`lot-${lot.lot_id}-service`} label="Название в исходных данных (service)" value={lot.service} onChange={(event) => updateLot(lot.lot_id, { service: event.target.value })} />
                <TextField id={`lot-${lot.lot_id}-territory-title`} label="Территория" value={lot.territory_title} onChange={(event) => updateLot(lot.lot_id, { territory_title: event.target.value })} />
                <TextField id={`lot-${lot.lot_id}-archetype`} label="Код территориального архетипа" value={lot.territorial_archetype} onChange={(event) => updateLot(lot.lot_id, { territorial_archetype: event.target.value })} />
                <TextField id={`lot-${lot.lot_id}-groups`} className="sm:col-span-2" label="Группы возможностей через запятую" value={lot.capability_groups.join(', ')}
                  onChange={(event) => updateLot(lot.lot_id, { capability_groups: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} />
                {LOT_NUMBERS.map((field) => (
                  <TextField key={String(field.key)} id={`lot-${lot.lot_id}-${String(field.key)}`} label={field.label} type="number" min={field.min} max={field.max} step={field.step ?? 'any'}
                    value={Number.isFinite(lot[field.key] as number) ? String(lot[field.key]) : ''}
                    onChange={(event) => updateLot(lot.lot_id, { [field.key]: event.target.value === '' ? Number.NaN : Number(event.target.value) })} />
                ))}
                <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-card px-4 text-[13px] font-medium text-ink-700">
                  <input type="checkbox" className="size-4 accent-brand" checked={lot.federal}
                    onChange={(event) => updateLot(lot.lot_id, { federal: event.target.checked })} />
                  Федеральный лот (federal)
                </label>
              </div>
            </Collapsible>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {draft.modes.map((mode) => (
            <section key={mode.mode_id} className="rounded-card border border-white bg-white/45 p-5">
              <h3 className="mb-4 text-[22px] font-bold">Режим {mode.mode_id}</h3>
              <div className="flex flex-col gap-4">
                {MODE_NUMBERS.map((field) => (
                  <TextField key={String(field.key)} id={`mode-${mode.mode_id}-${String(field.key)}`} label={field.label} type="number" min={0} step="any"
                    value={Number.isFinite(mode[field.key] as number) ? String(mode[field.key]) : ''}
                    onChange={(event) => updateMode(mode.mode_id, { [field.key]: event.target.value === '' ? Number.NaN : Number(event.target.value) })} />
                ))}
                <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-card px-4 text-[13px] font-medium text-ink-700">
                  <input type="checkbox" className="size-4 accent-brand" checked={mode.public_core}
                    onChange={(event) => updateMode(mode.mode_id, { public_core: event.target.checked })} />
                  Входит в общественное ядро (public_core)
                </label>
              </div>
            </section>
          ))}
        </div>
      )}

      {error ? <p role="alert" className="text-[13px] text-fail">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => { setDraft(cloneCalculationInputs(official)); setError(null) }}>
          Вернуть официальные
        </Button>
        <DialogClose asChild><Button type="button" variant="ghost">Отмена</Button></DialogClose>
        <Button type="submit">Применить и пересчитать</Button>
      </div>
    </form>
  )
}
