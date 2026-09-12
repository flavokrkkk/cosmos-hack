import { createElement } from 'react'

import { cn } from '@shared/lib/cn'

import { lotIcon } from '../../lib'

type Props = {
  lotId: string
  /** Синяя — активный/выбранный лот, серая — карточка в каталоге, приглушённая. */
  tone?: 'brand' | 'muted' | 'ink'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE = { sm: 'size-5', md: 'size-7', lg: 'size-8' }
const TONE = { brand: 'text-brand', muted: 'text-muted', ink: 'text-ink' }

/** Иконка лота из справочника по идентификатору; компонент не создаётся, а выбирается. */
export function LotIcon({ lotId, tone = 'brand', size = 'md', className }: Props) {
  return createElement(lotIcon(lotId), {
    'aria-hidden': true,
    weight: 'fill',
    className: cn(SIZE[size], TONE[tone], className),
  })
}
