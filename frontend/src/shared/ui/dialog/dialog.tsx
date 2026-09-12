import { X } from '@phosphor-icons/react'
import { Dialog as RadixDialog } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@shared/lib/cn'

import { IconButton } from '../iconButton'

export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close

type ContentProps = Omit<ComponentProps<typeof RadixDialog.Content>, 'title'> & {
  /** Ширина окна: `md` — модалка лота, `lg` — сравнение вариантов. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Заголовок обязателен для доступности; визуально может быть скрыт. */
  title: ReactNode
  description?: ReactNode
  hideTitle?: boolean
  children: ReactNode
}

const SIZE: Record<NonNullable<ContentProps['size']>, string> = {
  sm: 'max-w-[440px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[960px]',
  xl: 'max-w-[1200px]',
}

/**
 * Модальное окно дизайн-системы: тёмная подложка, непрозрачная карточка со скруглением 24px,
 * крестик в правом верхнем углу. Фокус, Esc и клик по подложке — от Radix.
 */
export function DialogContent({
  size = 'md', title, description, hideTitle = false, className, children, ...props
}: ContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay
        className={cn(
          'fixed inset-0 z-40 bg-[rgb(8_12_24/0.62)] backdrop-blur-[2px]',
          'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
        )}
      />
      <RadixDialog.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col',
          /* Непрозрачный фон страницы: стеклянные плитки внутри выглядят как на странице,
             а содержимое за окном не просвечивает. */
          'rounded-[24px] border border-line bg-page shadow-panel outline-none',
          'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
          SIZE[size],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 px-7 pt-6">
          <div className={cn('min-w-0', hideTitle && 'sr-only')}>
            <RadixDialog.Title className="text-[24px] leading-tight font-bold tracking-[-0.015em]">
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-1 text-sm text-muted">
                {description}
              </RadixDialog.Description>
            ) : null}
          </div>
          <RadixDialog.Close asChild>
            <IconButton label="Закрыть" className="-mt-1 -mr-2">
              <X weight="bold" />
            </IconButton>
          </RadixDialog.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-5 pb-7">{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}
