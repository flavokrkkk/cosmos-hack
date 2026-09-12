import type { ComponentPropsWithRef, ReactNode } from 'react'

import { cn } from '@shared/lib/cn'

type TextFieldProps = ComponentPropsWithRef<'input'> & {
  label: ReactNode
  error?: string
  /** Необязательная подсказка под подписью. */
  hint?: string
}

/**
 * Поле формы: подпись, инпут и текст ошибки.
 * Совместимо с react-hook-form — принимает результат register() через spread,
 * включая ref (React 19 передаёт ref обычным пропом).
 */
export function TextField({ label, error, hint, id, name, className, ...inputProps }: TextFieldProps) {
  const fieldId = id ?? name
  const errorId = error && fieldId ? `${fieldId}-error` : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="text-[13px] font-medium text-ink-700" htmlFor={fieldId}>
        {label}
      </label>
      {hint ? <p className="-mt-1 text-[12px] text-muted">{hint}</p> : null}
      <input
        aria-describedby={errorId}
        aria-invalid={Boolean(error)}
        className={cn(
          'h-11 rounded-2xl border border-line bg-card px-4 text-[15px] text-ink shadow-inset',
          'placeholder:text-muted-300 focus:border-line-strong focus:bg-lifted focus:outline-none',
          'aria-[invalid=true]:border-fail',
        )}
        id={fieldId}
        name={name}
        {...inputProps}
      />
      {error ? (
        <p className="text-[12px] text-fail" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
