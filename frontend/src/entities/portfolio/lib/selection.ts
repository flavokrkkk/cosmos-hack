import type { SelectionItem } from '@shared/api/contracts'

/** Ровно столько лотов образуют портфель по условию кейса. */
export const PORTFOLIO_SIZE = 4

/** Устойчивый ключ состава: порядок выбора не важен, режим важен. */
export function selectionKey(selection: readonly SelectionItem[]): string {
  return [...selection]
    .map((item) => `${item.lot_id}:${item.mode_id}`)
    .sort()
    .join('|')
}

/** Ключ набора лотов без режимов — так бэкенд нормализует `lot_ids`. */
export function lotIdsKey(lotIds: readonly string[]): string {
  return [...lotIds].sort().join('|')
}

export function sortedLotIds(lotIds: readonly string[]): string[] {
  return [...lotIds].sort()
}

export function selectionLabel(selection: readonly SelectionItem[]): string {
  return selection.map((item) => `${item.lot_id}:${item.mode_id}`).join(' · ')
}
