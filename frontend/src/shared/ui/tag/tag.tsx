import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@shared/lib/cn'

const tagVariants = cva(
  'inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-semibold tracking-[0.02em] whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-card text-ink shadow-chip',
        muted: 'bg-sunken text-ink-500',
        brand: 'bg-brand-50 text-brand-700',
        pass: 'bg-pass-bg text-pass',
        fail: 'bg-fail-bg text-fail',
        warn: 'bg-warn-bg text-warn',
      },
      size: {
        sm: 'h-[22px] px-2.5 text-[11px]',
        md: 'h-[30px] px-3.5 text-[13px] font-medium tracking-normal',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
)

export type TagProps = ComponentProps<'span'> & VariantProps<typeof tagVariants>

/** Метка: группа возможностей на карточке, статус, счётчик. */
export function Tag({ className, tone, size, ...props }: TagProps) {
  return <span className={cn(tagVariants({ tone, size }), className)} {...props} />
}
