import type { ConstraintCheck } from '@shared/api/contracts'

import { formatNumber, formatSlack, formatThreshold } from '../../lib'

type Props = {
  checks: ConstraintCheck[]
  scenario: string
}

/**
 * Таблица «условие → порог → факт → запас → статус».
 *
 * Статус подписан словом, а не только цветом: по критерию Т3 эксперт должен
 * видеть и порог, и фактическое значение, а не голый индикатор.
 */
export function ConstraintsTable({ checks, scenario }: Props) {
  const failed = checks.filter((check) => !check.passed).length

  return (
    <table className="data-table">
      <caption className="data-table__caption">
        Ограничения, сценарий {scenario}
        {failed > 0 ? (
          <span className="badge badge--fail">нарушено: {failed}</span>
        ) : (
          <span className="badge badge--pass">все {checks.length} выполнены</span>
        )}
      </caption>
      <thead>
        <tr>
          <th scope="col">Условие</th>
          <th scope="col" className="data-table__num">Порог</th>
          <th scope="col" className="data-table__num">Факт</th>
          <th scope="col" className="data-table__num">Запас</th>
          <th scope="col">Статус</th>
        </tr>
      </thead>
      <tbody>
        {checks.map((check) => (
          <tr key={check.code} className={check.passed ? undefined : 'is-failed'}>
            <th scope="row">
              {check.title}
              <span className="data-table__note">{check.code}</span>
            </th>
            <td className="data-table__num">{formatThreshold(check)}</td>
            <td className="data-table__num">{formatNumber(check.actual)}</td>
            <td className="data-table__num">{formatSlack(check.slack)}</td>
            <td>
              <span className={`badge ${check.passed ? 'badge--pass' : 'badge--fail'}`}>
                {check.passed ? 'PASS' : 'FAIL'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
