import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { CalculationInputs, Scenario, SelectionItem } from '@shared/api/contracts'

import { MAX_CANDIDATE_LOTS } from '../lib/selection'
import { cloneCalculationInputs } from './calculationInputs'

export type WorkspaceMode = 'auto' | 'manual'

/**
 * Какой вариант показывают блоки «Текущий портфель» и «Проверка».
 * `default` — результат гибридного подбора, а если его там нет —
 * первая опорная точка фронта.
 */
export type ActiveVariant =
  | { kind: 'default' }
  | { kind: 'alternative'; index: number }
  | { kind: 'saved'; id: string }
  | { kind: 'custom'; selection: SelectionItem[] }

export type ManualOrigin = 'empty' | 'manual' | 'copy'

type WorkspaceState = {
  /** Версия данных, под которую собрано состояние. Другая версия — состояние сбрасывается. */
  datasetHash: string | null
  mode: WorkspaceMode
  /** Сценарий ПРОСМОТРА проверок. Не меняет состав, режимы и цены. */
  scenario: Scenario
  /** Условие ПОИСКА для следующего подбора: искать только среди проходящих STRESS. */
  requireStress: boolean
  /** null — официальные входы; объект — явный сценарий пользователя для текущей сессии. */
  calculationInputs: CalculationInputs | null
  /** Условия последнего запущенного автоподбора; `null` — подбор ещё не запускали. */
  autoSearch: { requireStress: boolean; startedAt: number } | null
  /** Открытый вариант отдельно для каждого режима страницы: у них разные списки альтернатив. */
  activeVariant: Record<WorkspaceMode, ActiveVariant>
  /** До восьми кандидатов; сервер выбирает четыре лота и назначает им режимы. */
  manualLotIds: string[]
  manualAllowedModes: Record<string, string[]>
  manualOrigin: ManualOrigin
}

type WorkspaceActions = {
  bindDataset: (datasetHash: string) => void
  setMode: (mode: WorkspaceMode) => void
  setScenario: (scenario: Scenario) => void
  setRequireStress: (value: boolean) => void
  applyCalculationInputs: (inputs: CalculationInputs | null) => void
  /** Запуск автоподбора с текущим условием поиска. */
  launchAutoSearch: () => void
  applySearchOptions: (lotIds: string[], modes: Record<string, string[]>) => void
  /** Открыть вариант в текущем режиме страницы (рекомендация, альтернатива). */
  openVariant: (variant: ActiveVariant) => void
  /** Открыть сохранённый вариант: всегда в автоподборе, где есть блок просмотра. */
  openSavedVariant: (id: string, inputs: CalculationInputs | null) => void
  /** Точный состав с заданными пользователем режимами; проверяем даже нарушения. */
  openCustomVariant: (selection: readonly SelectionItem[]) => void
  toggleManualLot: (lotId: string) => void
  removeManualLot: (lotId: string) => void
  clearManual: () => void
  /** «Изменить вручную»: копия состава варианта, оригинал не трогаем. */
  startManualFrom: (lotIds: string[]) => void
}

const INITIAL: WorkspaceState = {
  datasetHash: null,
  mode: 'auto',
  scenario: 'STRESS',
  requireStress: true,
  calculationInputs: null,
  autoSearch: null,
  activeVariant: { auto: { kind: 'default' }, manual: { kind: 'default' } },
  manualLotIds: [],
  manualAllowedModes: {},
  manualOrigin: 'empty',
}

/** Убираем прежние фильтры, сохраняя выбор пользователя и привязку к данным. */
function migrateWorkspace(persisted: unknown): WorkspaceState {
  if (!persisted || typeof persisted !== 'object') return { ...INITIAL }
  const state = persisted as Partial<WorkspaceState> & { allowedModes?: { manual?: unknown } }
  const previousModes = state.manualAllowedModes ?? state.allowedModes?.manual
  const manualAllowedModes = previousModes && typeof previousModes === 'object'
    ? Object.fromEntries(Object.entries(previousModes).flatMap(([lot, modes]) => {
        if (!Array.isArray(modes)) return []
        const valid = [...new Set(modes.filter((mode): mode is string =>
          typeof mode === 'string' && ['A', 'B', 'C'].includes(mode)))].sort()
        return valid.length ? [[lot, valid]] : []
      }))
    : {}
  const manualLotIds = Array.isArray(state.manualLotIds)
    ? [...new Set(state.manualLotIds.filter((id) => typeof id === 'string'))].slice(0, MAX_CANDIDATE_LOTS)
    : []
  const savedAuto = state.activeVariant?.auto
  return {
    datasetHash: typeof state.datasetHash === 'string' ? state.datasetHash : null,
    mode: state.mode === 'manual' ? 'manual' : 'auto',
    scenario: state.scenario === 'BASE' ? 'BASE' : 'STRESS',
    requireStress: typeof state.requireStress === 'boolean' ? state.requireStress : INITIAL.requireStress,
    calculationInputs: state.calculationInputs && typeof state.calculationInputs === 'object'
      ? cloneCalculationInputs(state.calculationInputs as CalculationInputs)
      : null,
    autoSearch: state.autoSearch && typeof state.autoSearch.requireStress === 'boolean'
      && typeof state.autoSearch.startedAt === 'number' && Number.isFinite(state.autoSearch.startedAt)
      ? { requireStress: state.autoSearch.requireStress, startedAt: state.autoSearch.startedAt }
      : null,
    // Индексы альтернатив относились к старым фильтрам; сохранённый вариант имеет стабильный id.
    activeVariant: {
      auto: savedAuto?.kind === 'saved' && typeof savedAuto.id === 'string'
        ? { kind: 'saved', id: savedAuto.id }
        : savedAuto?.kind === 'custom' && Array.isArray(savedAuto.selection)
          && savedAuto.selection.length === 4
          && new Set(savedAuto.selection.map((item) => item.lot_id)).size === 4
          && savedAuto.selection.every((item) => typeof item.lot_id === 'string' && typeof item.mode_id === 'string')
          ? { kind: 'custom', selection: savedAuto.selection.map((item) => ({ ...item })) }
        : { kind: 'default' },
      manual: { kind: 'default' },
    },
    manualLotIds,
    manualAllowedModes,
    manualOrigin: manualLotIds.length === 0 ? 'empty' : state.manualOrigin === 'copy' ? 'copy' : 'manual',
  }
}

/**
 * Рабочее состояние страницы.
 *
 * Хранятся только ВХОДЫ (что выбрал пользователь), результаты расчёта живут в
 * кеше React Query и восстанавливаются по тем же ключам. Так на экране не бывает
 * чисел, которых нельзя получить заново из входов и версии данных.
 *
 * sessionStorage — «в рамках сессии»: перезагрузка вкладки состояние сохраняет,
 * новая вкладка начинает с чистого листа.
 */
export const useWorkspace = create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set) => ({
      ...INITIAL,

      bindDataset: (datasetHash) =>
        set((state) =>
          state.datasetHash === datasetHash ? state : { ...INITIAL, datasetHash },
        ),

      setMode: (mode) => set({ mode }),
      setScenario: (scenario) => set({ scenario }),
      setRequireStress: (requireStress) =>
        set((state) => state.requireStress === requireStress ? state : ({
          requireStress,
          autoSearch: state.autoSearch ? { requireStress, startedAt: Date.now() } : null,
          activeVariant: { auto: { kind: 'default' }, manual: { kind: 'default' } },
        })),

      applyCalculationInputs: (calculationInputs) =>
        set((state) => ({
          calculationInputs: calculationInputs ? cloneCalculationInputs(calculationInputs) : null,
          autoSearch: state.autoSearch ? { requireStress: state.requireStress, startedAt: Date.now() } : null,
          activeVariant: { auto: { kind: 'default' }, manual: { kind: 'default' } },
        })),

      launchAutoSearch: () =>
        set((state) => ({
          autoSearch: { requireStress: state.requireStress, startedAt: Date.now() },
          activeVariant: { ...state.activeVariant, auto: { kind: 'default' } },
        })),

      applySearchOptions: (lotIds, modes) =>
        set((state) => ({
          mode: 'manual',
          manualLotIds: [...lotIds],
          manualOrigin: lotIds.length ? 'manual' : 'empty',
          manualAllowedModes: structuredClone(modes),
          activeVariant: { ...state.activeVariant, manual: { kind: 'default' } },
        })),

      openVariant: (variant) =>
        set((state) => ({ activeVariant: { ...state.activeVariant, [state.mode]: variant } })),

      openSavedVariant: (id, inputs) =>
        set((state) => ({
          mode: 'auto',
          calculationInputs: inputs ? cloneCalculationInputs(inputs) : null,
          activeVariant: { ...state.activeVariant, auto: { kind: 'saved', id } },
        })),

      openCustomVariant: (selection) =>
        set((state) => ({
          mode: 'auto',
          activeVariant: {
            ...state.activeVariant,
            auto: { kind: 'custom', selection: selection.map((item) => ({ ...item })) },
          },
        })),

      toggleManualLot: (lotId) =>
        set((state) => {
          const without = state.manualLotIds.filter((id) => id !== lotId)
          const manualActive = { ...state.activeVariant, manual: { kind: 'default' } as const }
          if (without.length !== state.manualLotIds.length) {
            return {
              manualLotIds: without,
              manualOrigin: without.length ? state.manualOrigin : 'empty',
              activeVariant: manualActive,
            }
          }
          if (state.manualLotIds.length >= MAX_CANDIDATE_LOTS) return state
          return {
            manualLotIds: [...state.manualLotIds, lotId],
            manualOrigin: state.manualOrigin === 'empty' ? 'manual' : state.manualOrigin,
            activeVariant: manualActive,
          }
        }),

      removeManualLot: (lotId) =>
        set((state) => {
          const manualLotIds = state.manualLotIds.filter((id) => id !== lotId)
          return {
            manualLotIds,
            manualOrigin: manualLotIds.length ? state.manualOrigin : 'empty',
            activeVariant: { ...state.activeVariant, manual: { kind: 'default' } },
          }
        }),

      clearManual: () =>
        set((state) => ({
          manualLotIds: [],
          manualAllowedModes: {},
          manualOrigin: 'empty',
          activeVariant: { ...state.activeVariant, manual: { kind: 'default' } },
        })),

      startManualFrom: (lotIds) =>
        set((state) => ({
          mode: 'manual',
          manualLotIds: [...new Set(lotIds)].slice(0, MAX_CANDIDATE_LOTS),
          manualAllowedModes: {},
          manualOrigin: 'copy',
          activeVariant: { ...state.activeVariant, manual: { kind: 'default' } },
        })),

    }),
    {
      name: 'cosmos-workspace',
      version: 6,
      storage: createJSONStorage(() => sessionStorage),
      migrate: migrateWorkspace,
      partialize: (state) => ({
        datasetHash: state.datasetHash,
        mode: state.mode,
        scenario: state.scenario,
        requireStress: state.requireStress,
        calculationInputs: state.calculationInputs,
        autoSearch: state.autoSearch,
        activeVariant: state.activeVariant,
        manualLotIds: state.manualLotIds,
        manualAllowedModes: state.manualAllowedModes,
        manualOrigin: state.manualOrigin,
      }),
    },
  ),
)
