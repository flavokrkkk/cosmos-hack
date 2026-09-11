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
        'inline-flex items-center rounded-full bg-card shadow-card',
        size === 'lg' ? 'p-1' : 'p-[3px]',
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            'rounded-full font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 ease-(--ease-soft)',
            'text-ink-500 hover:text-ink data-[state=on]:bg-brand data-[state=on]:text-white data-[state=on]:shadow-brand',
            'disabled:opacity-40',
            size === 'lg' ? 'h-10 px-6 text-[15px]' : 'h-8 px-4 text-[13px]',
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
