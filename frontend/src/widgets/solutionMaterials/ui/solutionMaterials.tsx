import { ArrowSquareOut } from '@phosphor-icons/react'

import type { CaseCatalog } from '@shared/api/contracts'
import { STATUS_LABEL, SUBMISSION_MANIFEST, type MaterialStatus } from '@shared/config/submissionManifest'
import { Collapsible, Panel, Tag, Tile } from '@shared/ui'

type Props = {
  /** Каталога может не быть: раздел обязан открываться и до расчёта. */
  catalog: CaseCatalog | undefined
  /** Пользователь смотрит собранный вручную вариант, а не решение команды. */
  isDraft: boolean
}

const STATUS_TONE: Record<MaterialStatus, 'pass' | 'warn' | 'fail'> = {
  ready: 'pass',
  draft: 'warn',
  missing: 'fail',
}

/**
 * «Материалы решения» — постоянный нижний раздел страницы (бриф Z1).
 *
 * Доступен всегда, в том числе до расчёта и при ошибке бэкенда; это витрина
 * материалов, а не дерево папок. Отсутствующий материал помечен «не добавлено»
 * и НЕ получает ссылку: фальшивая активная ссылка хуже отсутствия.
 */
export function SolutionMaterials({ catalog, isDraft }: Props) {
  const ready = SUBMISSION_MANIFEST.flatMap((group) => group.materials).filter((m) => m.status === 'ready').length
  const total = SUBMISSION_MANIFEST.flatMap((group) => group.materials).length

  return (
    <Panel id="materials" className="px-4 py-3">
      <Collapsible
        title="Материалы финального решения команды"
        summary={<span>готово {ready} из {total}</span>}
      >
        <p className="mb-4 max-w-[760px] text-[13px] leading-snug text-muted">
          Состав сдачи по критериям П1–П9 и Т1–Т5.
          {catalog ? (
            <>
              {' '}Данные <code>{catalog.dataset_hash.slice(0, 12)}…</code>, движок {catalog.engine_version}.
            </>
          ) : null}
        </p>

        {isDraft ? (
          <p className="mb-4 rounded-2xl bg-brand-50 px-4 py-2.5 text-[12.5px] text-brand-700">
            Наверху открыт черновик; материалы ниже относятся к решению команды.
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {SUBMISSION_MANIFEST.map((group) => (
            <section key={group.id} className="rounded-card bg-card/60 p-4">
              <h3 className="text-[15px] font-bold">{group.title}</h3>
              <p className="mt-0.5 text-[12px] text-muted">{group.criteria}</p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {group.materials.map((material) => (
                  <li key={material.title}>
                    <Tile className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[13.5px] font-semibold">
                          {material.href ? (
                            <a href={material.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                              {material.title}
                              <ArrowSquareOut className="size-3.5" aria-hidden />
                            </a>
                          ) : (
                            material.title
                          )}
                        </span>
                        <Tag tone={STATUS_TONE[material.status]}>{STATUS_LABEL[material.status]}</Tag>
                      </div>
                      <p className="mt-1 text-[12px] leading-snug text-ink-500">{material.purpose}</p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-muted">
                        <span>{material.format}</span>
                        {material.path ? <code>{material.path}</code> : null}
                      </p>
                      {material.note ? <p className="mt-1 text-[11.5px] text-warn">{material.note}</p> : null}
                    </Tile>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-4 text-[11.5px] leading-snug text-muted">
          Пути — относительно корня репозитория. «Готово» — файл в репозитории, не одобрение содержания.
        </p>
      </Collapsible>
    </Panel>
  )
}
