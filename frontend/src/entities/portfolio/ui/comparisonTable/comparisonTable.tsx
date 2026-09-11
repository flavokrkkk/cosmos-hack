import type { ComparisonResult } from '@shared/api/contracts'
import { SCENARIOS } from '@shared/api/contracts'

import {
  DELTA_ROWS, DELTA_VERDICT_LABEL, deltaVerdict, formatDelta, scenarioVerdict,
} from '../../lib/compare'
import { formatNumber, selectionLabel } from '../../lib/format'

type Props = {
  result: ComparisonResult
  /** Подписи вариантов в порядке `result.variants`. */
  titles: string[]
}

/**
 * Сопоставление вариантов по одним и тем же показателям — критерий Т4.
 *
 * Три правила, которые здесь соблюдены:
 *
 * 1. Колонки считал один и тот же движок на одном `dataset_hash`. Числа взяты
 *    из ответа `/portfolio/compare`, фронтенд ничего не пересчитывает.
 * 2. BASE и STRESS показаны для ОДНОГО И ТОГО ЖЕ состава: сценарий меняет
 *    только пороги проверки, а не выбор лотов, режимы и цены.
 * 3. Дельты подписаны по каждому показателю отдельно — «выигрыш» или «плата».
 *    Суммарного балла варианта нет: он потребовал бы весов, а метод команды
 *    весов не использует. `vpub` и `cash` не складываются.
 */
export function ComparisonTable({ result, titles }: Props) {
  const { variants, baseline_index: baselineIndex } = result
  const baselineTitle = titles[baselineIndex] ?? `Вариант ${baselineIndex + 1}`

  return (
    <div className="compare">
      <div className="compare__scroll">
        <table className="data-table compare__table">
          <caption className="data-table__caption">
            Сопоставление вариантов
            <span className="badge badge--neutral">база: {baselineTitle}</span>
          </caption>
          <thead>
            <tr>
              <th scope="col">Показатель</th>
              {variants.map((variant, index) => (
                <th key={variant.input_hash} scope="col" className="compare__head">
                  <span className="compare__title">{titles[index] ?? `Вариант ${index + 1}`}</span>
                  <span className="compare__selection">{selectionLabel(variant.selection)}</span>
                  {index === baselineIndex ? (
                    <span className="badge badge--neutral">база сравнения</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Сначала допустимость: без неё сравнивать числа бессмысленно. */}
            {SCENARIOS.map((scenario) => (
              <tr key={scenario} className="compare__row--scenario">
                <th scope="row">
                  Проверка, сценарий {scenario}
                  <span className="data-table__note">
                    состав и режимы те же; отличаются только пороги
                  </span>
                </th>
                {variants.map((variant) => {
                  const verdict = scenarioVerdict(variant, scenario)
                  return (
                    <td key={variant.input_hash}>
                      <span className={`badge ${verdict.feasible ? 'badge--pass' : 'badge--fail'}`}>
                        {verdict.feasible ? 'PASS' : 'FAIL'}
                      </span>
                      <span className="compare__note">
                        выполнено {verdict.passed} из {verdict.total}
                      </span>
                      {verdict.failedCodes.length > 0 ? (
                        <span className="compare__note compare__note--fail">
                          нарушено: {verdict.failedCodes.join(', ')}
                        </span>
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            ))}

            {DELTA_ROWS.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  {row.title}
                  <span className="data-table__note">
                    {row.unit ? `${row.unit} · ` : ''}
                    лучше {row.better === 'more' ? 'больше' : 'меньше'}
                  </span>
                </th>
                {variants.map((variant, index) => {
                  const value = variant.metrics ? variant.metrics[row.key] : null
                  const delta = result.deltas[index]?.[row.key]
                  const verdict =
                    delta === undefined ? 'same' : deltaVerdict(delta, row.better)
                  return (
                    <td key={variant.input_hash} className="data-table__num">
                      <span className="compare__value">
                        {value === null ? '—' : formatNumber(value)}
                      </span>
                      {index === baselineIndex || delta === undefined ? null : (
                        <span className={`compare__delta compare__delta--${verdict}`}>
                          {formatDelta(delta)}
                          <span className="compare__verdict">
                            {DELTA_VERDICT_LABEL[verdict]}
                          </span>
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="panel__note">
        Дельты считаются к базе сравнения и подписаны по каждому показателю отдельно:
        видно, что вариант выигрывает и чем за это платит. Общего балла варианта нет —
        он потребовал бы весов, а метод команды весов не вводит. Общественная ценность
        и денежные поступления не складываются: это разные контуры.
      </p>
    </div>
  )
}
