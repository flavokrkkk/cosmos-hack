import { Switch as RadixSwitch } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@shared/lib/cn'

type Props = ComponentProps<typeof RadixSwitch.Root>

/** Тумблер: синяя дорожка во включённом состоянии, белая шайба с тенью. */
export function Switch({ className, ...props }: Props) {
  return (
    <RadixSwitch.Root
      className={cn(
        'relative inline-flex h-[26px] w-[50px] shrink-0 cursor-pointer items-center rounded-full',
        'bg-muted-300 shadow-inset transition-colors duration-200 ease-(--ease-soft)',
        'data-[state=checked]:bg-brand disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb
        className={cn(
          'block size-[22px] translate-x-[2px] rounded-full bg-white shadow-chip transition-transform duration-200 ease-(--ease-soft)',
          'data-[state=checked]:translate-x-[26px]',
        )}
      />
    </RadixSwitch.Root>
  )
}
