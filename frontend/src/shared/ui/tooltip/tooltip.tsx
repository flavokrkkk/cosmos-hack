import { Tooltip as RadixTooltip } from 'radix-ui'
import { useRef, useState, type ReactNode } from 'react'

import { cn } from '@shared/lib/cn'

export const TooltipProvider = RadixTooltip.Provider

type Props = {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

/**
 * Подсказка по наведению, фокусу И нажатию: на touch-устройствах hover нет, поэтому
 * тап по элементу открывает и закрывает подсказку (бриф §9). Обёртываемый элемент
 * должен принимать ref и быть фокусируемым — иначе с клавиатуры подсказку не открыть.
 */
export function Tooltip({ content, children, side = 'top', className }: Props) {
  const [open, setOpen] = useState(false)
  /* Radix закрывает подсказку на pointerdown, поэтому «была ли открыта» запоминаем до клика. */
  const wasOpen = useRef(false)
  return (
    <RadixTooltip.Root open={open} onOpenChange={setOpen}>
      <RadixTooltip.Trigger
        asChild
        onPointerDown={() => {
          wasOpen.current = open
        }}
        onClick={() => setOpen(!wasOpen.current)}
      >
        {children}
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          onPointerDownOutside={() => setOpen(false)}
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
