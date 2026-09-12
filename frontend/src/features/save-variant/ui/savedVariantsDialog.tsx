import { Trash } from '@phosphor-icons/react'

import { selectionLabel, useSavedVariants, useWorkspace } from '@entities/portfolio'
import { SCENARIOS } from '@shared/api/contracts'
import { Button, Dialog, DialogContent, IconButton, Tag } from '@shared/ui'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  datasetHash: string
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const SOURCE_LABEL = {
  team: 'портфель команды',
  reference: 'опорная точка',
  manual: 'ручная проверка',
  saved: 'копия',
} as const

/**
 * Список сохранённых вариантов. «Открыть» показывает вариант в блоке просмотра
 * автоподбора и пересчитывает его; сохранённый снимок допустимости — только подсказка.
 */
export function SavedVariantsDialog({ open, onOpenChange, datasetHash }: Props) {
  const items = useSavedVariants((state) => state.items)
  const remove = useSavedVariants((state) => state.remove)
  const openSaved = useWorkspace((state) => state.openSavedVariant)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" title="Сохранённые варианты" description="Хранятся в этом браузере.">
        {items.length === 0 ? (
          <p className="rounded-card bg-panel px-6 py-10 text-center text-[13.5px] text-muted">
            Пока ничего не сохранено. Нажмите «Сохранить вариант» под проверкой портфеля.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const incompatible = item.datasetHash !== datasetHash
              return (
                <li key={item.id} className="flex items-start gap-4 rounded-card bg-panel px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold">{item.name}</span>
                      <Tag tone="muted">{SOURCE_LABEL[item.source]}</Tag>
                      <span className="text-[11.5px] text-muted">{dateFormat.format(new Date(item.createdAt))}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-ink-500 tabular-nums">{selectionLabel(item.selection)}</p>
                    {item.comment ? <p className="mt-1 text-[12.5px] text-muted">{item.comment}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {incompatible ? (
                        <Tag tone="warn">Устаревшая версия данных</Tag>
                      ) : (
                        SCENARIOS.map((scenario) => (
                          <Tag key={scenario} tone={item.feasible[scenario] ? 'pass' : 'fail'}>
                            {scenario} {item.feasible[scenario] ? 'проходит' : 'не проходит'}
                          </Tag>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={incompatible}
                      onClick={() => {
                        openSaved(item.id)
                        onOpenChange(false)
                      }}
                    >
                      Открыть
                    </Button>
                    <IconButton label={`Удалить «${item.name}»`} onClick={() => remove(item.id)}>
                      <Trash />
                    </IconButton>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
