import type { ConstraintCheck, PortfolioMetrics } from '@shared/api/contracts'

const decimal = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** Округление только для отображения: проверки и сравнение идут по сырым числам. */
export function formatNumber(value: number): string {
  return decimal.format(value)
}

/** Запас со знаком. `null` — запас не определён (например, у условия `== 4`). */
export function formatSlack(slack: number | null): string {
  if (slack === null) return '—'
  const sign = slack > 0 ? '+' : ''
  return `${sign}${decimal.format(slack)}`
}

export function formatThreshold(check: ConstraintCheck): string {
  return `${check.operator} ${decimal.format(check.threshold)}`
}

type MetricRow = {
  key: keyof PortfolioMetrics
  title: string
  unit: string
  /** Подпись, которая не даёт прочитать показатель неправильно. */
  caveat?: string
}

/**
 * Порядок и подписи показателей.
 *
 * `vpub` и `cash` — величины разной природы, их нельзя складывать;
 * `kcash` — отношение поступлений к расходам, а не прибыль, ROI или
 * срок окупаемости. Подписи здесь — единственное место, где это закреплено
 * в интерфейсе, поэтому менять их формулировки нельзя без причины.
 */
export const METRIC_ROWS: readonly MetricRow[] = [
  { key: 'c0_mrub', title: 'Стартовые затраты', unit: 'млн ₽' },
  { key: 'opex_mrub_per_year', title: 'Годовые расходы', unit: 'млн ₽/год' },
  {
    key: 'cash_mrub_per_year',
    title: 'Денежные поступления',
    unit: 'млн ₽/год',
    caveat: 'якорные + коммерческие, с коэффициентами режима',
  },
  {
    key: 'vpub_mrub_per_year',
    title: 'Общественная ценность',
    unit: 'млн ₽/год',
    caveat: 'модельная шкала кейса; не деньги и не складывается с поступлениями',
  },
  {
    key: 'kcash',
    title: 'Покрытие расходов',
    unit: '',
    caveat: 'поступления ÷ расходы. Не прибыль, не ROI, не срок окупаемости',
  },
  { key: 't_rep', title: 'Средняя тиражируемость', unit: '' },
  { key: 'public_core_lots', title: 'Лотов в общественном ядре', unit: 'шт.' },
  { key: 'territorial_archetypes', title: 'Территориальных архетипов', unit: 'шт.' },
  { key: 'capability_groups', title: 'Групп возможностей', unit: 'шт.' },
  { key: 'readiness_1_5', title: 'Готовность', unit: '1–5' },
  { key: 'resilience_1_5', title: 'Устойчивость', unit: '1–5' },
  { key: 'scale_1_5', title: 'Масштабируемость', unit: '1–5' },
]

export function selectionLabel(selection: { lot_id: string; mode_id: string }[]): string {
  return selection.map((item) => `${item.lot_id}:${item.mode_id}`).join(', ')
}
