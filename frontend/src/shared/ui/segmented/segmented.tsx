import { ToggleGroup } from 'radix-ui'

import { cn } from '@shared/lib/cn'

export type SegmentedOption<T extends string> = {
  value: T
  label: string
  disabled?: boolean
}

type Props<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  /** `lg` — переключатель режима страницы, `sm` — BASE/STRESS у результата. */
  size?: 'lg' | 'sm'
  /** Подпись для скринридера: чем именно переключаем. */
  label: string
  className?: string
}

/**
 * Сегментированный переключатель: пилюля-контейнер и активный синий сегмент.
 * Всегда есть выбранное значение — снять выбор кликом по активному нельзя.
 */
export function Segmented<T extends string>({
  value, onChange, options, size = 'lg', label, className,
}: Props<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T)
      }}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-transparent',
        size === 'lg' ? 'p-0' : 'p-0',
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            'rounded-full border border-white font-medium whitespace-nowrap shadow-card backdrop-blur-[8px] transition-[background-color,color,box-shadow,opacity] duration-200 ease-(--ease-soft)',
            'bg-card text-ink-500 hover:text-ink data-[state=on]:bg-brand data-[state=on]:text-white data-[state=on]:shadow-brand data-[state=off]:opacity-55',
            'disabled:opacity-40',
            size === 'lg' ? 'h-[34px] px-4 text-[14px]' : 'h-[34px] px-4 text-[13px]',
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
