import { DownloadSimple } from '@phosphor-icons/react'

import { snapshotFiles, useComparison, useWorkspace } from '@entities/portfolio'
import type { Calculation, CaseCatalog, RecommendationResult } from '@shared/api/contracts'
import { downloadFile } from '@shared/lib'
import { notifyInfo } from '@shared/lib/notify'
import { Button, Tooltip } from '@shared/ui'

type Props = {
  calculation: Calculation | undefined
  catalog: CaseCatalog
  recommendation?: RecommendationResult
  className?: string
}

/**
 * Выгрузка текущего варианта — критерий Т5.
 *
 * Четыре файла: детали, показатели, конфигурация и отчёт выбора/проверок.
 * Сравнение, если посчитано, сохраняется внутри отчёта. Числа — из ответа API.
 */
export function ExportButton({ calculation, catalog, recommendation, className }: Props) {
  const comparison = useComparison((state) => state.result)
  const inputs = useWorkspace((state) => state.calculationInputs)
  const ready = calculation?.status === 'complete' && calculation.metrics !== null
  const files = ready ? snapshotFiles(calculation, catalog, comparison ?? undefined, recommendation, inputs) : []

  function download() {
    for (const file of files) downloadFile(file.name, file.content, file.mime)
    notifyInfo(`Скачано файлов: ${files.length}`, files.map((file) => file.name).join(', '))
  }

  return (
    <Tooltip
      content={
        ready
          ? 'Скачать 4 файла: расчёт по лотам, показатели, конфигурацию и отчёт с проверками BASE/STRESS'
          : 'Выгрузка доступна для полного портфеля из четырёх лотов'
      }
    >
      <Button variant="secondary" size="icon" aria-label="Скачать расчёт (CSV / JSON)" onClick={download} disabled={!ready} className={className}>
        <DownloadSimple className="size-4" aria-hidden />
      </Button>
    </Tooltip>
  )
}
