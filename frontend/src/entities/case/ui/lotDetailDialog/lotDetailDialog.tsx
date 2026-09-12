import type { ReactNode } from 'react'

import type { AccessMode, Lot, LotDetail } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Dialog, DialogContent, Tag, Tile } from '@shared/ui'

import { capabilityTitle, formatFactor } from '../../lib'
import { LotIcon } from '../lotIcon'

type Props = {
  lot: Lot | null
  /** Режим и пересчёт, если лот входит в просматриваемый портфель. */
  mode?: AccessMode
  detail?: LotDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  formatNumber: (value: number) => string
}

type FieldTile = {
  title: string
  description: string
  value: ReactNode
  hint?: ReactNode
}

/**
 * Модалка «Подробнее о лоте».
 *
 * Тексты подсказок — из словаря кейса (README §6) и плана §13.2: они не
 * переименовывают показатели и не додумывают методику индексов. Исходные
 * значения — из каталога, пересчёт после режима — из `calculation.detail`;
 * в браузере ничего не умножается.
 */
export function LotDetailDialog({
  lot, mode, detail, open, onOpenChange, formatNumber,
}: Props) {
  if (!lot) return null

  const money = (value: number) => `${formatNumber(value)} млн ₽`
  const perYear = (value: number) => `${money(value)} / год`
  const hasMode = Boolean(mode && detail)

  /** Значение после режима с исходным рядом; без режима — исходное значение. */
  const withMode = (
    base: number, k: number | undefined, after: number | undefined, unit: (v: number) => string,
  ): Pick<FieldTile, 'value' | 'hint'> => {
    if (hasMode && k !== undefined && after !== undefined) {
      return {
        value: unit(after),
        hint: `исходно ${formatNumber(base)} · ${formatFactor(k)} в режиме ${mode?.mode_id}`,
      }
    }
    return { value: unit(base), hint: 'исходное значение каталога' }
  }

  const finance: FieldTile[] = [
    {
      title: 'Стартовые затраты · C0',
      description: 'Разовые затраты на запуск сервиса. Не включают ежегодные расходы на его работу',
      ...withMode(lot.c0_mrub, mode?.k_c0, detail?.c0_mrub, money),
    },
    {
      title: 'Ежегодные расходы · OPEX',
      description: 'Сколько стоит поддерживать работу сервиса в течение года',
      ...withMode(lot.opex_mrub_per_year, mode?.k_opex, detail?.opex_mrub_per_year, perYear),
    },
    {
      title: 'Общественная ценность · VPUB',
      description: 'Оценка общественной пользы по модели кейса. Это не денежная выручка сервиса',
      ...withMode(lot.vpub_mrub_per_year, mode?.k_vpub, detail?.vpub_mrub_per_year, perYear),
    },
    {
      title: 'Якорные поступления',
      description:
        'Исходная якорная часть ежегодных поступлений. Конкретного плательщика команда определяет в финансовой схеме',
      value: perYear(lot.anchor_cash_mrub_per_year),
      hint: mode ? `${formatFactor(mode.k_anchor)} в режиме ${mode.mode_id}` : 'исходное значение каталога',
    },
    {
      title: 'Коммерческие поступления',
      description: 'Исходная коммерческая часть ежегодных денежных поступлений, заданная в данных кейса',
      value: perYear(lot.commercial_cash_mrub_per_year),
      hint: mode ? `${formatFactor(mode.k_commercial)} в режиме ${mode.mode_id}` : 'исходное значение каталога',
    },
    {
      title: 'Поступления после режима · CASH',
      description: 'Якорные и коммерческие поступления с учётом коэффициентов выбранного режима',
      value: detail ? perYear(detail.cash_mrub_per_year) : '—',
      hint: detail ? `режим ${detail.mode_id}` : 'появится после выбора режима',
    },
  ]

  const indexes: FieldTile[] = [
    {
      title: 'Готовность',
      description: 'Заданный индекс готовности сервиса по шкале от 1 до 5',
      value: `${formatNumber(lot.readiness_1_5)} / 5`,
    },
    {
      title: 'Устойчивость',
      description: 'Заданный индекс устойчивости сервиса по шкале от 1 до 5. Не является вероятностью успешной работы',
      value: `${formatNumber(lot.resilience_1_5)} / 5`,
    },
    {
      title: 'Тиражируемость',
      description: 'Заданный индекс возможности тиражирования сервиса по шкале от 1 до 5',
      value: `${formatNumber(lot.scale_1_5)} / 5`,
    },
    {
      title: 't_rep',
      description:
        'Безразмерный показатель из данных кейса. Для портфеля используется среднее значение',
      value: formatNumber(lot.t_rep),
    },
    {
      title: 'Общественное ядро · Public core',
      description: 'Учитывается ли выбранный режим в минимальном числе сервисов общественного ядра',
      value: mode ? (mode.public_core ? 'Да' : 'Нет') : '—',
      hint: mode ? `режим ${mode.mode_id}` : 'зависит от режима доступа',
    },
  ]

  const subtitle = [lot.lot_id, lot.territory_title, mode?.mode_id].filter(Boolean).join(' · ')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title={
          <span className="flex flex-col gap-3">
            <LotIcon lotId={lot.lot_id} tone="brand" size="lg" />
            <span>{lot.title}</span>
          </span>
        }
        description={subtitle}
      >
        <div className="flex flex-col gap-6">
          <section>
            <h3 className="mb-3 text-[18px] font-bold tracking-[-0.01em]">Финансовые показатели</h3>
            <TileGrid items={finance} columns={3} />
          </section>

          <section>
            <h3 className="mb-3 text-[18px] font-bold tracking-[-0.01em]">Индексы и признаки</h3>
            <TileGrid items={indexes} columns={3} />
          </section>

          <section>
            <h3 className="mb-3 text-[18px] font-bold tracking-[-0.01em]">Территория и возможности</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Tile className="px-4 py-3.5">
                <p className="text-[13px] font-semibold">Территория</p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                  Территориальный тип из исходных данных. Федеральный сервис не добавляет отдельную
                  территорию при проверке разнообразия
                </p>
                <p className="mt-2 text-[15px] font-semibold">
                  {lot.territory_title}
                  {lot.federal ? <Tag tone="muted" className="ml-2 align-middle">федеральный</Tag> : null}
                </p>
              </Tile>
              <Tile className="px-4 py-3.5">
                <p className="text-[13px] font-semibold">Космические возможности</p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                  Какие группы возможностей использует сервис. PNT и InSAR при проверке относятся к одной группе
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                  {lot.capability_groups.map((group) => (
                    <li key={group}>
                      <span className="font-semibold">{group}</span>
                      <span className="text-muted"> — {capabilityTitle(group)}</span>
                    </li>
                  ))}
                </ul>
              </Tile>
            </div>
          </section>

        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Сетка плиток на шесть долей: три плитки в ряд, а неполный последний ряд
 * растягивается на всю ширину — как во втором блоке макета.
 */
function TileGrid({ items, columns }: { items: FieldTile[]; columns: 2 | 3 }) {
  const perRow = columns
  const remainder = items.length % perRow
  const wideFrom = remainder === 0 ? items.length : items.length - remainder
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      {items.map((item, index) => (
        <Tile
          key={item.title}
          className={cn(
            'flex flex-col px-4 py-3.5',
            index >= wideFrom ? (remainder === 1 ? 'sm:col-span-6' : 'sm:col-span-3') : perRow === 3 ? 'sm:col-span-2' : 'sm:col-span-3',
          )}
        >
          <p className="text-[13px] leading-snug font-semibold">{item.title}</p>
          <p className="mt-0.5 flex-1 text-[11.5px] leading-snug text-muted">{item.description}</p>
          <p className="mt-3 text-[16px] font-bold tabular-nums">{item.value}</p>
          {item.hint ? <p className="mt-0.5 text-[11px] text-muted">{item.hint}</p> : null}
        </Tile>
      ))}
    </div>
  )
}
