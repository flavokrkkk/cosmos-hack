import { Tooltip as RadixTooltip } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '@shared/lib/cn'

export const TooltipProvider = RadixTooltip.Provider

type Props = {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

/**
 * Подсказка по наведению и фокусу. Обёртываемый элемент должен принимать ref
 * и быть фокусируемым — иначе с клавиатуры подсказку не открыть.
 */
export function Tooltip({ content, children, side = 'top', className }: Props) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-[60] max-w-[280px] rounded-xl bg-ink px-3 py-2 text-[12.5px] leading-snug text-white shadow-card',
            'data-[state=delayed-open]:animate-fade-in',
            className,
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-ink" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
