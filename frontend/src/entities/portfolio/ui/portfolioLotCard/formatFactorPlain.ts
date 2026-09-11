const factor = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

/** «1,05» без знака умножения — знак ставит строка формулы. */
export function formatFactorPlain(value: number): string {
  return factor.format(value)
}
