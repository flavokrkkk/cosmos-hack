import type { ReactNode } from 'react'

import { cn } from '@shared/lib/cn'

type Props = {
  /** Маленькая серая подпись над заголовком («Профиль»). */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  align?: 'center' | 'left'
  className?: string
  /** Уровень заголовка: страница использует h1 один раз. */
  as?: 'h1' | 'h2' | 'h3'
}

/** Центрированный заголовок раздела с подписью, как на макете. */
export function SectionHeading({
  eyebrow, title, description, align = 'center', className, as: Heading = 'h2',
}: Props) {
  return (
    <div className={cn('flex flex-col gap-2', align === 'center' && 'items-center text-center', className)}>
      {eyebrow ? <p className="text-[15px] text-muted">{eyebrow}</p> : null}
      <Heading
        className={cn(
          'leading-tight font-bold tracking-[-0.015em]',
          Heading === 'h1' ? 'text-[26px]' : 'text-[24px]',
        )}
      >
        {title}
      </Heading>
      {description ? (
        <p className="max-w-[520px] text-[13.5px] leading-snug text-muted">{description}</p>
      ) : null}
    </div>
  )
}
