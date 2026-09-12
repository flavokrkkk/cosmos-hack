import { formatMoney, formatNumber, selectionLabel } from '@entities/portfolio'
import type { CaseCatalog, DecisionAnalysis as Analysis } from '@shared/api/contracts'
import { Panel, PanelTitle } from '@shared/ui'

export function DecisionAnalysis({ analysis }: { analysis: Analysis | null | undefined; catalog: CaseCatalog }) {
  if (!analysis?.winner) return null
  const winner = analysis.winner
  const money = (value: number | null) => value === null ? '—' : formatMoney(value)
  return (
    <Panel className="w-full">
      <PanelTitle>Почему выбран этот портфель</PanelTitle>
      <p className="mt-2 text-sm text-muted">{selectionLabel(winner.selection)}. Шкалы рассчитаны по {analysis.reference_count} официально допустимым вариантам и зафиксированы до дополнительных условий поиска.</p>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div><dt className="text-muted">Максимум S в области поиска</dt><dd>{money(analysis.s_max_mrub)} / год</dd></div>
        <div><dt className="text-muted">Δ {analysis.cash_loss_limit_mrub === null ? '(автоматически)' : '(задан вручную)'}</dt><dd>{money(analysis.effective_delta_mrub)} / год</dd></div>
        <div><dt className="text-muted">После денежного ограничения</dt><dd>{analysis.cash_eligible_count} вариантов</dd></div>
        <div><dt className="text-muted">Лучшая слабая оценка Q</dt><dd>{formatNumber(winner.q, 4)} · ε = 0</dd></div>
      </dl>
      <p className="mt-4 text-sm">Требуемый S ≥ {money(analysis.cash_floor_mrub)} / год. Выбранный S = {money(winner.annual_surplus_mrub)} / год. Среди равных по Q выбран максимальный S.</p>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-brand">Шесть оценок и самое слабое место</summary>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs tabular-nums">
          <thead><tr>{['Показатель', 'Значение', 'Границы шкалы', 'Оценка', 'Определяет Q'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
          <tbody>{winner.components.map((item) => <tr key={item.key} className="border-t border-black/5">
            <td className="p-2">{item.title} {item.direction === 'min' ? '↓' : '↑'}</td><td className="p-2">{formatNumber(item.raw, 4)}</td>
            <td className="p-2 whitespace-nowrap">{formatNumber(item.minimum, 4)}–{formatNumber(item.maximum, 4)}</td>
            <td className="p-2">{formatNumber(item.normalized, 4)}</td><td className="p-2">{item.bottleneck ? 'Да' : '—'}</td>
          </tr>)}</tbody>
        </table></div>
      </details>
      <p className="mt-4 text-xs text-muted">{analysis.normalization}</p>
      <details className="mt-5">
        <summary className="cursor-pointer font-semibold">Как денежный предел меняет выбор</summary>
        <p className="mt-2 text-sm text-muted">Все точки смены победителя на текущих данных. Левая граница включена, правая — нет.</p>
        <ul className="mt-3 space-y-3 text-sm">{analysis.switching_curve.map((point) => <li key={point.delta_from_mrub}>
          Δ от {money(point.delta_from_mrub)}{point.delta_to_exclusive_mrub === null ? ' и выше' : ` до ${money(point.delta_to_exclusive_mrub)}`} / год: {selectionLabel(point.winner.selection)}; S = {money(point.winner.annual_surplus_mrub)}, Q = {formatNumber(point.winner.q, 4)}.
        </li>)}</ul>
      </details>
      <details className="mt-5">
        <summary className="cursor-pointer font-semibold">Чувствительность · {analysis.sensitivity.length} проверок</summary>
        <p className="mt-3 text-sm text-muted">Каждая проверка начинается от текущих входов. Границы шкал фиксированы; при шоках оценки могут выходить за 0–1. Smax пересчитывается. Автоматический Δ тоже пересчитывается; ручной Δ сохраняется.</p>
        <div className="mt-4 flex flex-col gap-3">{analysis.sensitivity.map((item) => {
          const outcome = item.outcome
          return <details key={item.id} className="rounded-xl bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold">{item.title} · допустимых: {item.feasible_count}</summary>
            <p className="mt-2 text-xs text-muted">Допущение. C0 ≤ {money(item.budget_cap_mrub)}; VPUB ≥ {money(item.vpub_floor_mrub_per_year)} / год; CASH × {item.cash_multiplier}; OPEX × {item.opex_multiplier}; обязательное ядро: {item.required_public_lot_ids.join(', ') || 'официальный минимум'}.</p>
            <p className="mt-3 text-sm">{outcome.winner ? (outcome.winner_changed ? 'Победитель изменился' : 'Победитель прежний') : 'Допустимых вариантов нет'}</p>
            {outcome.winner ? <p className="mt-1 text-sm">{selectionLabel(outcome.winner.selection)}. S = {money(outcome.winner.annual_surplus_mrub)} / год; Q = {formatNumber(outcome.winner.q, 4)}; Δ = {money(item.effective_delta_mrub)} / год.</p> : null}
            <p className="mt-2 text-xs text-muted">Исходный победитель {outcome.original_still_feasible ? 'проходит' : 'не проходит'} новые ограничения. Его S при этих условиях: {money(outcome.original_adjusted_surplus_mrub)} / год.</p>
          </details>
        })}</div>
      </details>
      <p className="mt-4 text-xs text-muted">{analysis.caveat}</p>
    </Panel>
  )
}
