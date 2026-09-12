import { useState } from 'react'

import { useWorkspace } from '@entities/portfolio'
import type { CaseCatalog } from '@shared/api/contracts'
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
          if (draft.cashLossLimit !== null && (!Number.isFinite(draft.cashLossLimit) || draft.cashLossLimit < 0)) {
            setError('Δ должен быть конечным неотрицательным числом.'); return
          }
          if (draft.publicLotIds.length > 4) { setError('Общественными можно назначить не более четырёх лотов.'); return }
          apply(draft)
          setError('')
        }}>
          <p className="font-semibold">Баланс критериев с денежным ограничением</p>
          <label className="flex flex-col gap-2 text-sm">Допустимая потеря годового денежного остатка Δ, млн ₽/год
            <input className="rounded-xl bg-white p-3" type="number" min="0" step="any" value={draft.cashLossLimit ?? ''} placeholder="Автоматически: минимум для достижения лучшего Q" onChange={(event) => setDraft({ ...draft, cashLossLimit: event.target.value === '' ? null : Number(event.target.value) })} />
          </label>
          <p className="text-sm text-muted">Сначала ограничиваем потерю денег, затем улучшаем самую слабую из шести оценок. При равенстве выбираем больший денежный остаток. Допуск качества ε = 0. Пустой Δ вычисляется из доступных вариантов; это приоритет качества, а не независимый денежный лимит.</p>
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
          {error ? <p role="alert" className="text-sm text-fail">{error}</p> : null}
          <Button type="submit" className="self-start">Применить условия</Button>
          <p className="text-xs text-muted">В ручном подборе обязательные общественные лоты должны входить в выбранный состав. Налоги, срок проекта и ставка дисконтирования не заданы — NPV и чистую прибыль не рассчитываем.</p>
        </form>
      </details>
    </Panel>
  )
}
