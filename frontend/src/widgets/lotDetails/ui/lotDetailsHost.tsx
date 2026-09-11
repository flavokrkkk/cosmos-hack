import { LotDetailDialog, useLotDetails } from '@entities/case'
import { formatNumber } from '@entities/portfolio'
import type { Calculation, CaseCatalog } from '@shared/api/contracts'

type Props = {
  catalog: CaseCatalog
  /** Открытый расчёт: если лот входит в него, модалка покажет режим и пересчёт. */
  calculation: Calculation | undefined
}

/** Единственное окно «Подробнее о лоте» на странице; какой лот открыт — в сторе. */
export function LotDetailsHost({ catalog, calculation }: Props) {
  const lotId = useLotDetails((state) => state.lotId)
  const close = useLotDetails((state) => state.close)

  const lot = catalog.lots.find((item) => item.lot_id === lotId) ?? null
  const detail = calculation?.detail.find((item) => item.lot_id === lotId)
  const mode = detail ? catalog.modes.find((item) => item.mode_id === detail.mode_id) : undefined

  return (
    <LotDetailDialog
      lot={lot}
      mode={mode}
      detail={detail}
      source={{ caseId: catalog.case_id, caseVersion: catalog.case_version }}
      open={lotId !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      formatNumber={formatNumber}
    />
  )
}
