import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { CalculationInputs, Scenario, SelectionItem } from '@shared/api/contracts'

/** `team` — портфель команды, `reference` — опорная точка фронта, `manual` — ручная проверка. */
export type SavedSource = 'team' | 'reference' | 'manual' | 'saved'

export type SavedVariant = {
  id: string
  name: string
  comment: string
  createdAt: string
  /** Версия данных и движка на момент сохранения: другая версия — вариант пересчитывается заново. */
  datasetHash: string
  engineVersion: string
  inputs: CalculationInputs | null
  /** Старые записи без снимка нельзя воспроизвести достоверно. */
  missingInputs?: boolean
  inputHash: string
  selection: SelectionItem[]
  source: SavedSource
  /** Снимок допустимости для списка; при открытии портфель пересчитывается. */
  feasible: Record<Scenario, boolean>
}

type SavedVariantsState = {
  items: SavedVariant[]
}

type SavedVariantsActions = {
  save: (variant: Omit<SavedVariant, 'id' | 'createdAt'>) => SavedVariant
  remove: (id: string) => void
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Сохранённые варианты — localStorage, не sessionStorage: пользователь нажал
 * «Сохранить» осознанно, и терять список при закрытии вкладки нельзя.
 * Хранятся только входы (состав, режимы, версии); числа при открытии считает бэкенд.
 */
export const useSavedVariants = create<SavedVariantsState & SavedVariantsActions>()(
  persist(
    (set) => ({
      items: [],

      save: (variant) => {
        const item: SavedVariant = { ...structuredClone(variant), id: makeId(), createdAt: new Date().toISOString() }
        set((state) => ({ items: [item, ...state.items] }))
        return item
      },

      remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
    }),
    {
      name: 'cosmos-saved-variants',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => {
        const previous = persisted as { items?: SavedVariant[] } | null
        return { items: (previous?.items ?? []).map((item) => ({
          ...item, inputs: item.inputs ?? null, missingInputs: item.inputs === undefined,
        })) }
      },
    },
  ),
)
