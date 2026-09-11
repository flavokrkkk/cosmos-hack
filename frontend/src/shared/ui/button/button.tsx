import type { VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@shared/lib/cn'

import { buttonVariants } from './buttonVariants'

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Идёт запрос: кнопка недоступна, перед текстом крутится индикатор. */
    loading?: boolean
  }

export function Button({
  className, variant, size, loading = false, disabled, children, type = 'button', ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}
