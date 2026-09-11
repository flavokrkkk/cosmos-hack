import type { ConstraintCheck, PortfolioMetrics } from '@shared/api/contracts'

const decimal = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** Округление только для отображения: проверки и сравнение идут по сырым числам. */
export function formatNumber(value: number): string {
  return decimal.format(value)
}

/** «1 081 млн ₽» — деньги единовременно. */
export function formatMoney(value: number): string {
  return `${decimal.format(value)} млн ₽`
}

/** «274 млн ₽ / год» — деньги в год. */
export function formatMoneyPerYear(value: number): string {
  return `${decimal.format(value)} млн ₽ / год`
}

/** Запас со знаком. `null` — запас не определён (например, у условия `== 4`). */
export function formatSlack(slack: number | null): string {
  if (slack === null) return '—'
  const sign = slack > 0 ? '+' : ''
  return `${sign}${decimal.format(slack)}`
}

const OPERATOR_SIGN: Record<ConstraintCheck['operator'], string> = {
  '==': '',
  '<=': '≤ ',
  '>=': '≥ ',
}

/** «≥ 1 000» — порог со знаком сравнения; у равенства знак не печатается. */
export function formatThreshold(check: Pick<ConstraintCheck, 'operator' | 'threshold'>): string {
  return `${OPERATOR_SIGN[check.operator]}${decimal.format(check.threshold)}`
}

/** «769 / ≥ 1 000» — факт против порога, как на плитке ограничения. */
export function formatCheckValue(check: ConstraintCheck): string {
  return `${decimal.format(check.actual)} / ${formatThreshold(check)}`
}

export type MetricTileDefinition = {
  key: keyof PortfolioMetrics
  /** Короткая подпись плитки, как на макете. */
  label: string
  /** Полное название и предостережение для подсказки. */
  title: string
  caveat?: string
  format: (value: number) => string
}

/**
 * Плитки «Проверка этого портфеля».
 *
 * `vpub` и `cash` — величины разной природы, их нельзя складывать;
 * `kcash` — отношение поступлений к расходам, а не прибыль, ROI или
 * срок окупаемости. Подписи здесь — единственное место, где это закреплено
 * в интерфейсе, поэтому менять их формулировки нельзя без причины.
 */
export const METRIC_TILES: readonly MetricTileDefinition[] = [
  { key: 'c0_mrub', label: 'C0', title: 'Стартовые затраты портфеля', format: formatMoney },
  {
    key: 'opex_mrub_per_year',
    label: 'OPEX / год',
    title: 'Годовые эксплуатационные расходы',
    format: formatMoney,
  },
  {
    key: 'vpub_mrub_per_year',
    label: 'VPUB / год',
    title: 'Общественная ценность',
    caveat: 'модельная шкала кейса; не деньги и не складывается с поступлениями',
    format: formatMoney,
  },
  {
    key: 'cash_mrub_per_year',
    label: 'CASH / год',
    title: 'Денежные поступления',
    caveat: 'якорные + коммерческие, с коэффициентами режима',
    format: formatMoney,
  },
  {
    key: 'kcash',
    label: 'KCASH',
    title: 'Покрытие расходов',
    caveat: 'поступления ÷ расходы. Не прибыль, не ROI, не срок окупаемости',
    format: formatNumber,
  },
  {
    key: 't_rep',
    label: 't_rep',
    title: 'Средний t_rep по выбранным лотам',
    caveat: 'безразмерный показатель из данных кейса',
    format: formatNumber,
  },
]

/** Компактные плитки ручного режима: четыре ключевых показателя. */
export const METRIC_TILES_COMPACT: readonly MetricTileDefinition[] = METRIC_TILES.filter((tile) =>
  ['c0_mrub', 'opex_mrub_per_year', 'vpub_mrub_per_year', 'kcash'].includes(tile.key),
)

/** Дополнительные показатели портфеля для раскрываемых подробностей. */
export const EXTRA_METRIC_TILES: readonly MetricTileDefinition[] = [
  { key: 'readiness_1_5', label: 'Готовность', title: 'Средний индекс готовности, 1–5', format: (v) => `${formatNumber(v)} / 5` },
  { key: 'resilience_1_5', label: 'Устойчивость', title: 'Средний индекс устойчивости, 1–5', format: (v) => `${formatNumber(v)} / 5` },
  { key: 'scale_1_5', label: 'Тиражируемость', title: 'Средний индекс тиражируемости, 1–5', format: (v) => `${formatNumber(v)} / 5` },
  { key: 'public_core_lots', label: 'Общественное ядро', title: 'Лотов в режиме с общественным ядром', format: (v) => `${formatNumber(v)} лот.` },
  { key: 'territorial_archetypes', label: 'Территории', title: 'Территориальных архетипов (без федеральных)', format: (v) => `${formatNumber(v)}` },
  { key: 'capability_groups', label: 'Группы возможностей', title: 'Разных групп космических возможностей', format: (v) => `${formatNumber(v)}` },
]

/**
 * Короткие подписи ограничений по коду — как на макете. Незнакомый код
 * показывается полным названием из ответа бэкенда.
 */
const CHECK_LABELS: Record<string, string> = {
  exact_lot_count: 'Количество лотов',
  territorial_archetypes: 'Территориальные архетипы',
  capability_groups: 'Группы возможностей',
  public_core_lots: 'Общественное ядро',
  c0_limit: 'C0, млн ₽',
  opex_limit: 'OPEX, млн ₽ / год',
  vpub_floor: 'VPUB, млн ₽ / год',
  kcash_floor: 'KCASH',
  t_rep_floor: 't_rep',
}

export function checkLabel(check: Pick<ConstraintCheck, 'code' | 'title'>): string {
  return CHECK_LABELS[check.code] ?? check.title
}
