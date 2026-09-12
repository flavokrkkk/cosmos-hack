import { CaretDown } from '@phosphor-icons/react'
import { Collapsible as RadixCollapsible } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '@shared/lib/cn'

type Props = {
  title: ReactNode
  /** Что показывается рядом с заголовком в свёрнутом состоянии. */
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

/** Раскрываемый блок: заголовок-кнопка со стрелкой, содержимое ниже. */
export function Collapsible({ title, summary, defaultOpen = false, children, className }: Props) {
  return (
    <RadixCollapsible.Root defaultOpen={defaultOpen} className={cn('group', className)}>
      <RadixCollapsible.Trigger
        className={cn(
          'flex w-full items-center justify-between gap-4 rounded-2xl px-2 py-2 text-left',
          'transition-colors duration-200 hover:bg-white/60',
        )}
      >
        <span className="text-[18px] font-bold tracking-[-0.01em]">{title}</span>
        <span className="flex items-center gap-3 text-[13px] text-muted">
          {summary}
          <CaretDown
            weight="bold"
            className="size-5 shrink-0 transition-transform duration-300 ease-(--ease-soft) group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </span>
      </RadixCollapsible.Trigger>
      <RadixCollapsible.Content
        className={cn(
          'overflow-hidden px-2',
          'data-[state=open]:animate-collapse-down data-[state=closed]:animate-collapse-up',
        )}
      >
        <div className="pt-3 pb-1">{children}</div>
      </RadixCollapsible.Content>
    </RadixCollapsible.Root>
  )
}
