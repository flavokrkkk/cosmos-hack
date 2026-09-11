import type { ComponentProps } from 'react'

import { cn } from '@shared/lib/cn'

type Props = ComponentProps<'button'> & {
  /** Обязательная подпись: у иконки без текста нет имени для скринридера. */
  label: string
  size?: 'sm' | 'md'
}

/** Круглая кнопка с одной иконкой: ⓘ у карточки, × у чипа, закрытие модалки. */
export function IconButton({ label, size = 'md', className, type = 'button', ...props }: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-200',
        'hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'size-6 [&>svg]:size-3.5' : 'size-8 [&>svg]:size-[18px]',
        className,
      )}
      {...props}
    />
  )
}
