import { create } from 'zustand'

type LotDetailsState = {
  /** Какой лот открыт в модалке «Подробнее»; `null` — закрыта. */
  lotId: string | null
  open: (lotId: string) => void
  close: () => void
}

/**
 * Состояние модалки лота. Не персистится: после перезагрузки модалка закрыта.
 * Живёт в сторе, а не в пропсах, потому что ⓘ есть на карточках в трёх разных
 * виджетах, а окно одно — на странице.
 */
export const useLotDetails = create<LotDetailsState>((set) => ({
  lotId: null,
  open: (lotId) => set({ lotId }),
  close: () => set({ lotId: null }),
}))
