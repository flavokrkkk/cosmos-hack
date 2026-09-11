import type { PortfolioMetrics } from '@shared/api/contracts'

import { METRIC_ROWS, formatNumber } from '../../lib'

type Props = { metrics: PortfolioMetrics }

export function MetricsTable({ metrics }: Props) {
  return (
    <table className="data-table">
      <caption className="data-table__caption">Показатели портфеля</caption>
      <thead>
        <tr>
          <th scope="col">Показатель</th>
          <th scope="col" className="data-table__num">Значение</th>
          <th scope="col">Единица</th>
        </tr>
      </thead>
      <tbody>
        {METRIC_ROWS.map((row) => (
          <tr key={row.key}>
            <th scope="row">
              {row.title}
              {row.caveat ? <span className="data-table__note">{row.caveat}</span> : null}
            </th>
            <td className="data-table__num">{formatNumber(Number(metrics[row.key]))}</td>
            <td className="data-table__unit">{row.unit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
