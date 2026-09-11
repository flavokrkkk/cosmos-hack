import type { CaseCatalog } from '@shared/api/contracts'
import { Tooltip } from '@shared/ui'

type Props = {
  catalog: CaseCatalog
}

/**
 * Версия данных на виду: README кейсодержателя §14, сценарий 1 — эксперт должен
 * видеть, что использован официальный датасет, и уметь сверить его хеш.
 */
export function PageFooter({ catalog }: Props) {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 pb-4 text-[12px] text-muted">
      <span>КосмоХакатон · Кейс 02 «Космос как инфраструктура»</span>
      <span>{catalog.case_id} · v{catalog.case_version}</span>
      <Tooltip content={<span className="break-all">dataset_hash {catalog.dataset_hash}</span>}>
        <span tabIndex={0} className="cursor-help rounded-md">
          данные <code>{catalog.dataset_hash.slice(0, 12)}…</code>
        </span>
      </Tooltip>
      <span>движок {catalog.engine_version}</span>
      <Tooltip content={<span>{catalog.source_refs.join(' · ')}</span>}>
        <span tabIndex={0} className="cursor-help rounded-md">источники: {catalog.source_refs.length}</span>
      </Tooltip>
    </footer>
  )
}
