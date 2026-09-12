import { useId } from 'react'

import { useWorkspace } from '@entities/portfolio'
import { cn } from '@shared/lib/cn'
import { Switch, Tooltip } from '@shared/ui'

type Props = {
  className?: string
  /** Компактный вариант для правой колонки ручной проверки. */
  compact?: boolean
}

/**
 * Изменение условия обновляет уже запущенный подбор.
 */
export function StressSwitch({ className, compact = false }: Props) {
  const id = useId()
  const requireStress = useWorkspace((state) => state.requireStress)
  const setRequireStress = useWorkspace((state) => state.setRequireStress)

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <Tooltip content="Включено: искать портфель для BASE и STRESS. Выключено: достаточно пройти BASE.">
        <label
          htmlFor={id}
          className={cn('cursor-pointer font-medium', compact ? 'text-[13.5px]' : 'text-[15px]')}
        >
          Учитывать сокращение бюджета · STRESS
        </label>
      </Tooltip>
      <Switch id={id} checked={requireStress} onCheckedChange={setRequireStress} />
    </div>
  )
}
