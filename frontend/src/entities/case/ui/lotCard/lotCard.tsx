import { Check, Info, Plus } from '@phosphor-icons/react'

import type { Lot } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Button, Card, IconButton } from '@shared/ui'

import { lotSubtitle } from '../../lib'
import { CapabilityTags } from '../capabilityTags'
import { LotIcon } from '../lotIcon'

export type LotCardState = 'idle' | 'selected' | 'dimmed'

type Props = {
  lot: Lot
  /** `dimmed` — четыре лота уже выбраны, этот не входит: читаем, но приглушён. */
  state?: LotCardState
  /** Кнопка «Выбрать / Выбрано». Без обработчика карточка только показывает лот. */
  onToggle?: (lotId: string) => void
  onDetails: (lotId: string) => void
  /** Формат чисел в подвале: исходные значения каталога. */
  formatMoney: (value: number) => string
  className?: string
}

/**
 * Карточка лота в каталоге. Показывает ИСХОДНЫЕ значения каталога, без
 * коэффициентов режима: пересчитанные числа живут в портфеле, и смешивать
 * их на одной карточке нельзя — эксперт перестанет понимать источник числа.
 */
export function LotCard({
  lot, state = 'idle', onToggle, onDetails, formatMoney, className,
}: Props) {
  const selected = state === 'selected'

  return (
    <Card
      data-state={state}
      className={cn(
        'flex flex-col p-[18px] transition-[opacity,box-shadow,transform] duration-300 ease-(--ease-soft)',
        state === 'dimmed' && 'opacity-45 shadow-tile',
        selected && 'ring-2 ring-brand/15',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <LotIcon lotId={lot.lot_id} tone={selected ? 'brand' : 'muted'} />
        <div className="flex items-center gap-1.5">
          <CapabilityTags groups={lot.capability_groups} className="flex items-center gap-1.5" />
          <IconButton label={`Подробнее о лоте ${lot.title}`} size="sm" onClick={() => onDetails(lot.lot_id)}>
            <Info />
          </IconButton>
        </div>
      </div>

      <div className="mt-7">
        <h3 className="text-[17px] leading-tight font-bold tracking-[-0.01em]">{lot.title}</h3>
        <p className="mt-1 text-[13px] text-muted">{lotSubtitle(lot)}</p>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3.5">
        <dl className="flex items-end gap-5">
          <div>
            <dt className="text-[11px] tracking-[0.02em] text-muted">C0</dt>
            <dd className="mt-0.5 text-[15px] font-medium tabular-nums">{formatMoney(lot.c0_mrub)}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.02em] text-muted">VPUB</dt>
            <dd className="mt-0.5 text-[15px] font-medium tabular-nums">
              {formatMoney(lot.vpub_mrub_per_year)} / год
            </dd>
          </div>
        </dl>

        {onToggle ? (
          <Button
            size="sm"
            variant={selected ? 'primary' : 'secondary'}
            aria-pressed={selected}
            onClick={() => onToggle(lot.lot_id)}
            className="h-[38px] px-4 text-[14px]"
          >
            {selected ? <Check className="size-4" weight="bold" aria-hidden /> : <Plus className="size-4" weight="bold" aria-hidden />}
            {selected ? 'Выбрано' : 'Выбрать'}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
