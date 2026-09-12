import type { FinancialSummary } from '@shared/api/contracts'
import { Collapsible, StatTile } from '@shared/ui'

import { formatMoney, formatNumber } from '../../lib/format'

type Props = {
  financial: FinancialSummary | null | undefined
  className?: string
}

/** «23,2 %» либо прочерк, когда остаток уже отрицательный и порога нет. */
function formatPercent(value: number | null): string {
  return value === null ? '—' : `${formatNumber(value, 1)} %`
}

/**
 * «Деньги и операционный запас»: годовой остаток CASH − OPEX, его источники и
 * запас до нулевого остатка. Все числа приходят в `calculation.financial`;
 * в браузере ничего не считается. Остаток — не прибыль: оговорка сервера
 * печатается под плитками.
 */
export function FinancialBreakdown({ financial, className }: Props) {
  if (!financial) return null
  const surplus = financial.annual_surplus_mrub
  const gap = financial.annual_funding_gap_mrub
  const selfFinanced = financial.operating_self_financed

  return (
    <Collapsible
      title={<span className="text-[15px] font-semibold">Деньги и операционный запас</span>}
      summary={<span className="tabular-nums">{formatMoney(surplus)} / год</span>}
      className={className}
    >
      <div className="grid auto-rows-fr grid-cols-2 items-stretch gap-2 sm:grid-cols-3">
        <StatTile
          label="Годовой остаток · CASH − OPEX"
          value={formatMoney(surplus)}
          hint={selfFinanced ? 'эксплуатация самоокупаема' : 'операционный дефицит'}
          tone={selfFinanced ? 'pass' : 'fail'}
          className="h-full"
        />
        <StatTile
          label="Не хватает на эксплуатацию"
          value={formatMoney(gap)}
          hint="в год"
          tone={gap > 0 ? 'fail' : 'neutral'}
          className="h-full"
        />
        <StatTile
          label="Якорные поступления"
          value={formatMoney(financial.anchor_cash_mrub_per_year)}
          hint="в год"
          className="h-full"
        />
        <StatTile
          label="Коммерческие поступления"
          value={formatMoney(financial.commercial_cash_mrub_per_year)}
          hint="в год"
          className="h-full"
        />
        <StatTile
          label="Запас: падение поступлений до нулевого остатка"
          value={formatPercent(financial.cash_drop_break_even_pct)}
          hint={financial.cash_drop_break_even_pct === null ? 'порог не определён' : 'при прочих равных'}
          tone={financial.cash_drop_break_even_pct === null ? 'fail' : 'neutral'}
          className="h-full"
        />
        <StatTile
          label="Запас: рост расходов до нулевого остатка"
          value={formatPercent(financial.opex_growth_break_even_pct)}
          hint={financial.opex_growth_break_even_pct === null ? 'порог не определён' : 'при прочих равных'}
          tone={financial.opex_growth_break_even_pct === null ? 'fail' : 'neutral'}
          className="h-full"
        />
      </div>
      <p className="mt-3 text-[12px] leading-snug text-muted">
        {financial.limitation} Оба порога проверяются по отдельности.
      </p>
    </Collapsible>
  )
}
