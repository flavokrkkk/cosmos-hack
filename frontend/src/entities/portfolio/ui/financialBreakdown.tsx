import type { FinancialSummary } from '@shared/api/contracts'

import { formatMoney, formatNumber } from '../lib/format'

export function FinancialBreakdown({ financial }: { financial: FinancialSummary | null | undefined }) {
  if (!financial) return null
  const rows = [
    ['Годовой остаток · CASH − OPEX', formatMoney(financial.annual_surplus_mrub)],
    ['Не хватает на эксплуатацию / год', formatMoney(financial.annual_funding_gap_mrub)],
    ['Якорные поступления / год', formatMoney(financial.anchor_cash_mrub_per_year)],
    ['Коммерческие поступления / год', formatMoney(financial.commercial_cash_mrub_per_year)],
    ['До нулевого остатка: падение поступлений', financial.cash_drop_break_even_pct === null ? 'Уже есть дефицит / порог не определён' : `${formatNumber(financial.cash_drop_break_even_pct)}%`],
    ['До нулевого остатка: рост расходов', financial.opex_growth_break_even_pct === null ? 'Уже есть дефицит / порог не определён' : `${formatNumber(financial.opex_growth_break_even_pct)}%`],
  ]
  return (
    <details className="mt-4 border-t border-black/5 pt-4">
      <summary className="cursor-pointer text-sm font-semibold">Деньги и операционный запас · {formatMoney(financial.annual_surplus_mrub)} / год</summary>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">{rows.map(([title, value]) => (
        <div key={title} className="rounded-xl bg-white p-3"><dt className="text-xs text-muted">{title}</dt><dd className="mt-2 text-sm font-semibold tabular-nums">{value}</dd></div>
      ))}</dl>
      <p className="mt-3 text-xs text-muted">{financial.limitation} Пороги падения поступлений и роста расходов проверяются по отдельности.</p>
    </details>
  )
}
