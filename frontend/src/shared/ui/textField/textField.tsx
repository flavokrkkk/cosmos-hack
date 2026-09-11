import type { ComponentPropsWithRef } from 'react'

type TextFieldProps = ComponentPropsWithRef<'input'> & {
  label: string
  error?: string
}

/**
 * Поле формы: подпись, инпут и текст ошибки.
 * Совместимо с react-hook-form — принимает результат register() через spread,
 * включая ref (React 19 передаёт ref обычным пропом).
 */
export function TextField({ label, error, id, name, ...inputProps }: TextFieldProps) {
  const fieldId = id ?? name
  const errorId = error && fieldId ? `${fieldId}-error` : undefined

  return (
    <div className="field">
      <label className="field__label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        aria-describedby={errorId}
        aria-invalid={Boolean(error)}
        className="field__input"
        id={fieldId}
        name={name}
        {...inputProps}
      />
      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
