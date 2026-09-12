import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@shared/lib/cn'

const tagVariants = cva(
  'inline-flex h-[22px] items-center rounded-full border border-line px-2.5 text-[10px] font-bold tracking-[0.02em] whitespace-nowrap backdrop-blur-[8px]',
  {
    variants: {
      tone: {
        neutral: 'bg-card text-ink/75 shadow-chip',
        muted: 'bg-card text-ink/50 shadow-chip',
        brand: 'bg-brand-50 text-brand-700',
        pass: 'bg-pass-bg text-pass',
        fail: 'bg-fail-bg text-fail',
        warn: 'bg-warn-bg text-warn',
      },
      size: {
        sm: 'h-[22px] px-2.5 text-[11px]',
        md: 'h-[28px] px-3.5 text-[12px] font-medium tracking-normal',
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
