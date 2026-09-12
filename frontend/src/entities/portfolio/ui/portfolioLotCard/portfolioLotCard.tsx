import { LotIcon, describeMode } from '@entities/case'
import type { AccessMode, Lot, LotDetail } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Card, ModeBadge, Tooltip } from '@shared/ui'

import { formatNumber } from '../../lib/format'
import { formatFactorPlain } from './formatFactorPlain'

type Props = {
  lot: Lot
  mode: AccessMode
  /** Пересчёт лота после режима — из `calculation.detail`. */
  detail: LotDetail
  onDetails?: (lotId: string) => void
  className?: string
}

type Row = {
  label: string
  base: number
  factor: number
  result: number
  unit: string
}

/**
 * Лот внутри «Текущего портфеля»: три строки «исходное × коэффициент = после режима».
 * Все три числа приходят с бэкенда (каталог, справочник режимов, detail) —
 * знак «=» ничего не вычисляет, а показывает, откуда взялось итоговое число.
 */
export function PortfolioLotCard({ lot, mode, detail, onDetails, className }: Props) {
  const rows: Row[] = [
    { label: 'C0', base: lot.c0_mrub, factor: mode.k_c0, result: detail.c0_mrub, unit: 'млн ₽' },
    {
      label: 'OPEX',
      base: lot.opex_mrub_per_year,
      factor: mode.k_opex,
      result: detail.opex_mrub_per_year,
      unit: 'млн ₽ / год',
    },
    {
      label: 'VPUB',
      base: lot.vpub_mrub_per_year,
      factor: mode.k_vpub,
      result: detail.vpub_mrub_per_year,
      unit: 'млн ₽ / год',
    },
  ]

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <LotIcon lotId={lot.lot_id} tone="brand" />
        <Tooltip content={describeMode(mode)}>
          <ModeBadge mode={mode.mode_id} title={`Режим ${mode.mode_id}`} className="cursor-default" />
        </Tooltip>
      </div>

      {/* Как на макете — только идентификатор; полное название в подсказке и в модалке. */}
      <h3 className="mt-4 text-[17px] leading-tight font-bold tracking-[-0.01em]" title={lot.title}>
        {lot.lot_id}
      </h3>

      <dl className="mt-3 flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] tracking-[0.02em] text-muted">{row.label}</dt>
            <dd className="mt-0.5 text-[14px] font-medium text-ink-700 tabular-nums">
              {formatNumber(row.base)} × {formatFactorPlain(row.factor)} ={' '}
              <span className="text-ink">{formatNumber(row.result)}</span> {row.unit}
            </dd>
          </div>
        ))}
      </dl>
    </>
  )

  if (onDetails) {
    return (
      <Card className={cn('p-0', className)}>
        <button
          type="button"
          onClick={() => onDetails(lot.lot_id)}
          className="block h-full w-full rounded-card p-4 text-left transition-shadow duration-300 ease-(--ease-soft) hover:shadow-card-hover"
          aria-label={`Подробнее о лоте ${lot.title} в режиме ${mode.mode_id}`}
        >
          {content}
        </button>
      </Card>
    )
  }

  return <Card className={cn('p-4', className)}>{content}</Card>
}
