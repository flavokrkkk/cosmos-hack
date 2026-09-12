import { cva } from 'class-variance-authority'

/**
 * Кнопка дизайн-системы: пилюля. Главное действие — синяя с мягким свечением,
 * второстепенное — белая с тенью; они никогда не стоят рядом одинаково окрашенными.
 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-line font-bold whitespace-nowrap backdrop-blur-[8px]',
    'transition-[background-color,box-shadow,transform,opacity] duration-200 ease-(--ease-soft) select-none',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white shadow-brand hover:bg-brand-600',
        secondary: 'bg-card text-ink shadow-card hover:shadow-card-hover',
        ghost: 'border-transparent bg-transparent text-ink-500 shadow-none hover:border-line-strong hover:bg-card hover:text-ink',
        link: 'h-auto rounded-md px-1 text-brand hover:text-brand-700 hover:underline',
        danger: 'bg-fail-bg text-fail hover:bg-fail-bg/80',
      },
      size: {
        lg: 'h-[38px] px-5 text-[14px]',
        md: 'h-[34px] px-4 text-[14px]',
        sm: 'h-[34px] px-4 text-[13px]',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'lg' },
  },
)
