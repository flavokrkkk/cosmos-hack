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
  /** `dimmed` — лот приглушён в представлении результата; выбор кандидатов его не использует. */
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
        'flex min-h-[183px] flex-col p-4 transition-[opacity,box-shadow,transform] duration-300 ease-(--ease-soft)',
        state === 'dimmed' && 'opacity-45 shadow-tile',
        selected && 'bg-white/70 shadow-card-hover',
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
        <h3 className="text-[16px] leading-tight font-bold">{lot.title}</h3>
        <p className="mt-1 text-[12px] font-semibold text-ink/50">{lotSubtitle(lot)}</p>
      </div>

      <div className="mt-auto flex items-end justify-between gap-2 border-t border-line/70 pt-3">
        <dl className="flex min-w-0 items-end gap-4">
          <div>
            <dt className="text-[10px] font-bold tracking-[0.02em] text-ink/45">C0</dt>
            <dd className="mt-1 text-[13px] font-semibold text-ink/50 tabular-nums">{formatMoney(lot.c0_mrub)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold tracking-[0.02em] text-ink/45">VPUB</dt>
            <dd className="mt-1 text-[13px] font-semibold leading-tight text-ink/50 tabular-nums">
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
            className="h-[34px] px-3 text-[14px]"
          >
            {selected ? <Check className="size-4" weight="bold" aria-hidden /> : <Plus className="size-4" weight="bold" aria-hidden />}
            {selected ? 'Выбрано' : 'Выбрать'}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
