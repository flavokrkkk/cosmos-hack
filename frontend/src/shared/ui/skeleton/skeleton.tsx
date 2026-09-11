import type { ComponentProps } from 'react'

import { cn } from '@shared/lib/cn'

/** Заглушка на время загрузки. Размер задаётся классами снаружи. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div aria-hidden className={cn('skeleton', className)} {...props} />
}
