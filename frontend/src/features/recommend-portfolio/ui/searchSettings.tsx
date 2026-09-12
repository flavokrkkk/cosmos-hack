import { useState } from 'react'

import { useWorkspace } from '@entities/portfolio'
import type { CaseCatalog, RankingMethod } from '@shared/api/contracts'
import { Button, Panel } from '@shared/ui'

export function SearchSettings({ catalog }: { catalog: CaseCatalog }) {
  const settings = useWorkspace((state) => state.searchSettings)
  const apply = useWorkspace((state) => state.setSearchSettings)
  const [draft, setDraft] = useState(settings)
  const [error, setError] = useState('')
  return (
    <Panel className="w-full">
      <details>
        <summary className="cursor-pointer font-semibold">Правило выбора и дополнительные условия</summary>
        <form className="mt-5 flex flex-col gap-5" onSubmit={(event) => {
          event.preventDefault()
          if (Object.values(draft.weights).some((weight) => !Number.isFinite(weight) || weight < 0) || Object.values(draft.weights).reduce((a, b) => a + b, 0) <= 0) {
            setError('Задайте неотрицательные веса; хотя бы один должен быть больше нуля.')
            return
          }
          if (draft.publicLotIds.length > 4) { setError('Общественными можно назначить не более четырёх лотов.'); return }
          apply(draft)
          setError('')
        }}>
          <label className="flex flex-col gap-2 text-sm">Основной способ выбора
            <select className="rounded-xl bg-white p-3" value={draft.methodId} onChange={(event) => setDraft({ ...draft, methodId: event.target.value as RankingMethod })}>
              {catalog.methods.filter((method) => method.id !== 'pareto_lexicographic_v1').map((method) => <option key={method.id} value={method.id}>{method.title}</option>)}
            </select>
          </label>
          <p className="text-sm text-muted">Обязательные ограничения сохраняются. Поля ниже — ваши дополнительные требования, а не условия организаторов. Пустое поле не вводит нового ограничения.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">Лимит запуска, млн ₽
              <input className="rounded-xl bg-white p-3" type="number" min="0.01" step="any" value={draft.budgetCap ?? ''} placeholder="Лимит выбранного сценария" onChange={(event) => setDraft({ ...draft, budgetCap: event.target.value === '' ? null : Number(event.target.value) })} />
            </label>
            <label className="flex flex-col gap-2 text-sm">Минимум общественной ценности, млн ₽/год
              <input className="rounded-xl bg-white p-3" type="number" min="0" step="any" value={draft.vpubFloor ?? ''} placeholder="Минимум из условий кейса" onChange={(event) => setDraft({ ...draft, vpubFloor: event.target.value === '' ? null : Number(event.target.value) })} />
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm">Какие лоты обязательно сохранить в общественном ядре</legend>
            <div className="flex flex-wrap gap-4">{catalog.lots.map((lot) => (
              <label key={lot.lot_id} className="flex items-center gap-2 text-sm" title={lot.title}>
                <input type="checkbox" checked={draft.publicLotIds.includes(lot.lot_id)} onChange={(event) => setDraft({ ...draft, publicLotIds: event.target.checked ? [...draft.publicLotIds, lot.lot_id].sort() : draft.publicLotIds.filter((id) => id !== lot.lot_id) })} />{lot.lot_id}
              </label>
            ))}</div>
          </fieldset>
          <fieldset>
            <legend className="mb-3 text-sm">Веса дополнительного взвешенного метода — по умолчанию равные</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{catalog.ranking_criteria.map((criterion) => (
              <label key={criterion.key} className="flex flex-col justify-between gap-2 text-xs">{criterion.title}
                <input type="number" className="w-full rounded-xl bg-white p-3" min="0" max="1000" step="any" value={draft.weights[criterion.key]} onChange={(event) => setDraft({ ...draft, weights: { ...draft.weights, [criterion.key]: Number(event.target.value) } })} />
              </label>
            ))}</div>
          </fieldset>
          {error ? <p role="alert" className="text-sm text-fail">{error}</p> : null}
          <Button type="submit" className="self-start">Применить условия</Button>
          <p className="text-xs text-muted">Оба метода пересчитываются на одинаковых условиях. В ручном подборе обязательные общественные лоты должны входить в выбранный состав. Налоги, срок проекта и ставка дисконтирования не заданы — NPV и чистую прибыль не рассчитываем.</p>
        </form>
      </details>
    </Panel>
  )
}
