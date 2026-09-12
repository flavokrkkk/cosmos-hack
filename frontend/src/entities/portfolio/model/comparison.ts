import { create } from 'zustand'

import type { ComparisonResult } from '@shared/api/contracts'

type ComparisonState = {
  /** Последнее выполненное сравнение и подписи его колонок — для раздела comparison в отчёте. */
  result: ComparisonResult | null
  titles: string[]
  set: (result: ComparisonResult, titles: string[]) => void
  clear: () => void
}

/** Не персистится: сравнение — действие по кнопке, после перезагрузки его повторяют. */
export const useComparison = create<ComparisonState>((set) => ({
  result: null,
  titles: [],
  set: (result, titles) => set({ result, titles }),
  clear: () => set({ result: null, titles: [] }),
}))
