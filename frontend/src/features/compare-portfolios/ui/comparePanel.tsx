import { useEffect, useMemo } from 'react'

import { ComparisonTable, useCompare } from '@entities/portfolio'
import type { ComparisonResult, RecommendationResult, SelectionItem } from '@shared/api/contracts'

import {
  MAX_VARIANTS, MIN_VARIANTS, buildCandidates, useComparisonSet,
} from '../model/useComparisonSet'

type Props = {
  datasetHash: string
  recommendation: RecommendationResult | undefined
  draft: SelectionItem[]
  draftOrigin: 'empty' | 'manual' | 'copy'
  /** Готовое сравнение уходит наверх: его кладут в экспорт как `comparison.csv`. */
  onResult: (result: ComparisonResult | undefined) => void
}

/**
 * Сопоставление вариантов — критерий Т4.
 *
 * Сравнивать можно рекомендацию алгоритма, её ручную правку и альтернативы из
 * того же перебора. Заведомо плохих вариантов «для контраста» в списке нет:
 * кандидаты не сочиняются здесь, а приходят из ответа `/portfolio/recommend`.
 */
export function ComparePanel({
  datasetHash, recommendation, draft, draftOrigin, onResult,
}: Props) {
  const compare = useCompare()
  const candidates = useMemo(
    () => buildCandidates(recommendation, draft, draftOrigin),
    [recommendation, draft, draftOrigin],
  )
  const set = useComparisonSet(candidates)

  const result = compare.data
  // Состав сравнения изменился — старая таблица больше не про него.
  const comparedIds = useMemo(
    () =>
      (result?.variants ?? [])
        .map((variant) =>
          [...variant.selection]
            .map((item) => `${item.lot_id}:${item.mode_id}`)
            .sort()
            .join('|'),
        )
        .join(' vs '),
    [result],
  )
  const currentIds = set.selectedIds.map((id) => id).join(' vs ')
  const isStale = Boolean(result) && comparedIds !== currentIds

  useEffect(() => {
    onResult(isStale ? undefined : result)
  }, [result, isStale, onResult])

  function run() {
    compare.mutate({
      variants: set.selected.map((candidate) => ({
        dataset_hash: datasetHash,
        selection: candidate.selection,
      })),
    })
  }

  return (
    <section className="panel" id="compare">
      <header className="panel__head">
        <h2>Сопоставление вариантов</h2>
        <span className="badge badge--neutral">
          выбрано {set.selectedIds.length} из {MAX_VARIANTS}
        </span>
      </header>

      {candidates.length === 0 ? (
        <p className="state">
          Сравнивать пока нечего. Запустите подбор — в список попадут рекомендация и
          альтернативы из того же перебора; полный ручной портфель добавится сам.
        </p>
      ) : (
        <>
          <p className="panel__muted">
            Отметьте от {MIN_VARIANTS} до {MAX_VARIANTS} вариантов. Первый отмеченный —
            база сравнения: дельты считаются к нему. Все кандидаты получены одним
            перебором и одним правилом выбора, ослабленных вариантов «для контраста» в
            списке нет.
          </p>

          <ul className="candidates">
            {candidates.map((candidate) => {
              const order = set.selectedIds.indexOf(candidate.id)
              const checked = order >= 0
              return (
                <li key={candidate.id} className={checked ? 'is-picked' : undefined}>
                  <label className="candidates__row">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && set.isFull}
                      onChange={() => set.toggle(candidate.id)}
                    />
                    <span className="candidates__body">
                      <span className="candidates__title">
                        {candidate.title}
                        <span className="badge badge--neutral">{candidate.sourceLabel}</span>
                        {order === 0 ? (
                          <span className="badge badge--accent">база сравнения</span>
                        ) : null}
                      </span>
                      <span className="candidates__selection">
                        {candidate.selection
                          .map((item) => `${item.lot_id}:${item.mode_id}`)
                          .join(', ')}
                      </span>
                      <span className="panel__muted">{candidate.reason}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          <div className="compare__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={run}
              disabled={!set.canCompare || compare.isPending}
            >
              {compare.isPending ? 'Считаем…' : 'Сравнить'}
            </button>
            {set.selectedIds.length > 0 ? (
              <button type="button" className="btn btn--ghost" onClick={set.reset}>
                Снять отметки
              </button>
            ) : null}
            {!set.canCompare ? (
              <span className="panel__muted">
                Нужно минимум {MIN_VARIANTS} варианта.
              </span>
            ) : null}
          </div>

          {compare.isError ? (
            <p className="state state--error">
              Сравнение не выполнено: {compare.error.message}
            </p>
          ) : null}

          {result ? (
            <div className={isStale ? 'is-stale' : undefined}>
              {isStale ? (
                <p className="state">
                  Набор вариантов изменился после расчёта. Таблица ниже относится к
                  предыдущему набору — нажмите «Сравнить», чтобы пересчитать.
                </p>
              ) : null}
              <ComparisonTable
                result={result}
                titles={
                  isStale
                    ? result.variants.map((_, index) => `Вариант ${index + 1}`)
                    : set.selected.map((candidate) => candidate.title)
                }
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
