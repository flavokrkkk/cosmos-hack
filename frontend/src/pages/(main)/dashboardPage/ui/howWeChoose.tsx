import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import type { MethodDefinition } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { Tag } from '@shared/ui'

type Props = {
  method: MethodDefinition
}

/**
 * «Как выбираем» — порядок предпочтений раскрывается по нажатию, чтобы
 * результат не выглядел ответом чёрного ящика. Метод помечен как допущение
 * команды: правильного портфеля в кейсе нет, и выдавать наш порядок
 * приоритетов за требование организаторов нельзя.
 */
export function HowWeChoose({ method }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-md text-[13.5px] font-medium text-brand hover:text-brand-700"
      >
        Как выбираем
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div className="w-full max-w-[560px] rounded-card bg-card p-5 text-left shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">{method.title}</span>
            <Tag tone="muted">метод: {method.origin} команды</Tag>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-muted">{method.description}</p>
          <ol className="mt-3 grid list-decimal gap-1 pl-5 text-[13px] text-ink-700 sm:grid-cols-2">
            {method.priorities.map((priority) => (
              <li key={priority}>{priority}</li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] leading-snug text-muted">
            Перебор оставляет недоминируемые варианты (фронт Парето) и показывает его опорные
            точки. Выбор одной точки фронта — решение команды, а не результат вычисления.
          </p>
        </div>
      ) : null}
    </div>
  )
}
