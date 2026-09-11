import { cn } from '@shared/lib/cn'

type Props = {
  /** Буква режима доступа: A, B или C. */
  mode: string
  size?: 'sm' | 'md'
  className?: string
  /** Расшифровка для скринридера и подсказки. */
  title?: string
}

/** Белый кружок с буквой режима в углу карточки лота. */
export function ModeBadge({ mode, size = 'md', className, title }: Props) {
  return (
    <span
      title={title}
      aria-label={title ?? `Режим ${mode}`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-card font-semibold text-ink shadow-chip',
        size === 'md' ? 'size-8 text-[12px]' : 'size-6 text-[11px]',
        className,
      )}
    >
      {mode}
    </span>
  )
}
