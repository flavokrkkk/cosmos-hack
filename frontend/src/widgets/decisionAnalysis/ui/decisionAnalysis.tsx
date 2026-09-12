import { formatMoney, formatNumber, selectionLabel } from '@entities/portfolio'
import type { CaseCatalog, DecisionAnalysis as Analysis, RankingMethod } from '@shared/api/contracts'
import { Panel, PanelTitle } from '@shared/ui'

export function DecisionAnalysis({ analysis, catalog }: { analysis: Analysis | null | undefined; catalog: CaseCatalog }) {
  if (!analysis?.methods.length) return null
  const title = (id: RankingMethod) => catalog.methods.find((method) => method.id === id)?.title ?? id
  return (
    <Panel className="w-full">
      <PanelTitle>Сравнение правил и чувствительность</PanelTitle>
      <p className="mt-2 text-sm text-muted">Одна допустимая область, два правила выбора. Все показатели и результаты ниже рассчитаны сервером.</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">{analysis.methods.map((method) => (
        <div key={method.method_id} className="rounded-2xl bg-white p-5">
          <h3 className="font-semibold">{title(method.method_id)}</h3>
          <p className="mt-2 text-sm">{selectionLabel(method.selection)}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">Остаток / год</dt><dd>{formatMoney(method.annual_surplus_mrub)}</dd></div>
            <div><dt className="text-muted">Общественная ценность / год</dt><dd>{formatMoney(method.vpub_mrub_per_year)}</dd></div>
            <div><dt className="text-muted">Запуск</dt><dd>{formatMoney(method.c0_mrub)}</dd></div>
            <div><dt className="text-muted">Покрытие расходов</dt><dd>{formatNumber(method.kcash)}</dd></div>
          </dl>
          {method.score !== null ? <p className="mt-3 text-sm">Взвешенный балл: {formatNumber(method.score, 4)}</p> : null}
          {method.components.length ? <details className="mt-3">
            <summary className="cursor-pointer text-sm text-brand">Из чего сложился балл</summary>
            <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs tabular-nums">
              <thead><tr>{['Показатель', 'Значение', 'Границы', 'Норма', 'Вес', 'Вклад'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
              <tbody>{method.components.map((item) => <tr key={item.key} className="border-t border-black/5">
                <td className="p-2">{item.title} {item.direction === 'min' ? '↓' : '↑'}</td><td className="p-2">{formatNumber(item.raw)}</td>
                <td className="p-2 whitespace-nowrap">{formatNumber(item.minimum)}–{formatNumber(item.maximum)}</td>
                <td className="p-2">{formatNumber(item.normalized, 3)}</td><td className="p-2">{formatNumber(item.weight * 100)}%</td><td className="p-2">{formatNumber(item.contribution, 4)}</td>
              </tr>)}</tbody>
            </table></div>
          </details> : null}
        </div>
      ))}</div>
      <p className="mt-4 text-xs text-muted">{analysis.normalization}</p>
      <details className="mt-5">
        <summary className="cursor-pointer font-semibold">Что изменится при других условиях · {analysis.sensitivity.length} проверок</summary>
        <p className="mt-3 text-sm text-muted">Каждая проверка начинается от текущих условий, а не от предыдущей строки. Границы нормирования фиксированы; при шоках нормированные значения могут выходить за 0–1.</p>
        <div className="mt-4 flex flex-col gap-3">{analysis.sensitivity.map((item) => (
          <details key={item.id} className="rounded-xl bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold">{item.title} · допустимых: {item.feasible_count}</summary>
            <p className="mt-2 text-xs text-muted">Допущение. C0 ≤ {formatMoney(item.budget_cap_mrub)}; VPUB ≥ {formatMoney(item.vpub_floor_mrub_per_year)} / год; CASH × {item.cash_multiplier}; OPEX × {item.opex_multiplier}; обязательное ядро: {item.required_public_lot_ids.join(', ') || 'только официальный минимум'}.</p>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">{analysis.methods.map((method) => {
              const outcome = item.outcomes[method.method_id]
              return <div key={method.method_id} className="text-sm">
                <h4 className="font-semibold">{title(method.method_id)}</h4>
                <p className="mt-1">{outcome.winner ? (outcome.winner_changed ? 'Победитель изменился' : 'Победитель прежний') : 'Допустимых вариантов нет'}</p>
                {outcome.winner ? <p className="mt-1">{selectionLabel(outcome.winner.selection)}<br />Остаток при этих условиях: {formatMoney(outcome.winner.annual_surplus_mrub)} / год</p> : null}
                <p className="mt-2 text-xs text-muted">Исходный победитель {outcome.original_still_feasible ? 'проходит' : 'не проходит'} новые условия. Его остаток: {outcome.original_adjusted_surplus_mrub === null ? '—' : formatMoney(outcome.original_adjusted_surplus_mrub)} / год.</p>
              </div>
            })}</div>
          </details>
        ))}</div>
      </details>
      <p className="mt-4 text-xs text-muted">{analysis.caveat}</p>
    </Panel>
  )
}
