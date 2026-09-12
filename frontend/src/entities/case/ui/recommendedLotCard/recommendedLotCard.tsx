import { Info } from '@phosphor-icons/react'
import type { CSSProperties } from 'react'

import type { Lot, LotDetail } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Card, IconButton } from '@shared/ui'

import { lotSubtitle } from '../../lib'
import { CapabilityTags } from '../capabilityTags'
import { LotIcon } from '../lotIcon'

type Props = {
  lot: Lot
  detail: LotDetail
  /** Режим, назначенный лоту в рекомендации. */
  modeId: string
  /** Подпись под режимом: «Выбран командой · режим» у портфеля команды, «Режим» у опорной точки. */
  modeLabel?: string
  onDetails: (lotId: string) => void
  formatMoney: (value: number) => string
  /** Лёгкий наклон карточки, как в «веере» на макете; на узких экранах снимается. */
  tilt?: number
  className?: string
}

/**
 * Показатели и режим открытого варианта приходят из calculation.detail.
 */
export function RecommendedLotCard({
  lot, detail, modeId, modeLabel = 'Режим', onDetails, formatMoney, tilt = 0, className,
}: Props) {
  return (
    <Card
      style={{ '--tilt': `${tilt}deg` } as CSSProperties}
      className={cn(
        'flex w-full flex-col p-[22px] transition-[rotate,box-shadow] duration-300 ease-(--ease-soft)',
        'lg:rotate-(--tilt) lg:hover:rotate-0 lg:hover:shadow-card-hover',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <LotIcon lotId={lot.lot_id} tone="brand" />
        <div className="flex items-center gap-1.5">
          <CapabilityTags groups={lot.capability_groups} className="flex items-center gap-1.5" />
          <IconButton label={`Подробнее о лоте ${lot.title}`} size="sm" onClick={() => onDetails(lot.lot_id)}>
            <Info />
          </IconButton>
        </div>
      </div>

      <div className="mt-9">
        <h3 className="text-[17px] leading-tight font-bold tracking-[-0.01em]">{lot.title}</h3>
        <p className="mt-1 text-[13px] text-muted">{lotSubtitle(lot)}</p>
      </div>

      <dl className="mt-4 flex gap-5 border-t border-line pt-3.5">
        <div>
          <dt className="text-[11px] tracking-[0.02em] text-muted" title={`С учётом режима ${modeId}`}>C0</dt>
          <dd className="mt-0.5 text-[15px] font-medium tabular-nums">{formatMoney(detail.c0_mrub)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-[0.02em] text-muted" title={`С учётом режима ${modeId}`}>VPUB</dt>
          <dd className="mt-0.5 text-[15px] font-medium tabular-nums">
            {formatMoney(detail.vpub_mrub_per_year)} / год
          </dd>
        </div>
      </dl>

      <dl className="mt-3 border-t border-line pt-3">
        <dt className="text-[11px] tracking-[0.02em] text-muted">{modeLabel}</dt>
        <dd className="mt-0.5 text-[16px] font-semibold">{modeId}</dd>
      </dl>
    </Card>
  )
}
