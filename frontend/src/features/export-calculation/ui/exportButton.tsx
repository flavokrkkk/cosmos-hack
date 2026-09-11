import { Download } from 'lucide-react'

import { snapshotFiles, useComparison } from '@entities/portfolio'
import type { Calculation, CaseCatalog } from '@shared/api/contracts'
import { downloadFile } from '@shared/lib'
import { notifyInfo } from '@shared/lib/notify'
import { Button, Tooltip } from '@shared/ui'

type Props = {
  calculation: Calculation | undefined
  catalog: CaseCatalog
  className?: string
}

/**
 * Выгрузка текущего варианта — критерий Т5.
 *
 * Имена файлов и колонки совпадают с контрольными снимками в `results/`,
 * которые пишет `python -m engine export`. Числа берутся из ответа бэкенда
 * дословно, в полной точности. Если сравнение уже посчитано, добавляется
 * `comparison.csv`.
 */
export function ExportButton({ calculation, catalog, className }: Props) {
  const comparison = useComparison((state) => state.result)
  const ready = calculation?.status === 'complete' && calculation.metrics !== null
  const files = ready ? snapshotFiles(calculation, catalog, comparison ?? undefined) : []

  function download() {
    for (const file of files) downloadFile(file.name, file.content, file.mime)
    notifyInfo(`Скачано файлов: ${files.length}`, files.map((file) => file.name).join(', '))
  }

  return (
    <Tooltip
      content={
        ready
          ? `Скачать ${files.length} файлов расчёта: ${files.map((file) => file.name).join(', ')}. decision.json хранит dataset_hash, engine_version и input_hash — при тех же значениях повторный расчёт обязан дать те же числа.`
          : 'Выгрузка доступна для полного портфеля из четырёх лотов'
      }
    >
      <Button variant="ghost" size="sm" onClick={download} disabled={!ready} className={className}>
        <Download className="size-4" aria-hidden />
        Скачать расчёт (CSV / JSON)
      </Button>
    </Tooltip>
  )
}
