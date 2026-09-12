import type { LotDetail } from '@shared/api/contracts'

/** Русские формы числительного: 1 лот, 2–4 лота, 5+ лотов. */
export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1]
  return forms[2]
}

/**
 * Одна строка о составе: сколько лотов в общественном ядре и в каких режимах
 * остальные. Только подсчёт по `detail` — никакой экономики в браузере.
 */
export function describeComposition(detail: LotDetail[]): string {
  const core = detail.filter((item) => item.public_core)
  const rest = detail.filter((item) => !item.public_core)
  const coreText = `${core.length} ${plural(core.length, ['лот', 'лота', 'лотов'])} с общественным ядром`

  if (rest.length === 0) return `Все ${detail.length} лота в общественном ядре`
  if (core.length === 0) return `Ни одного лота в общественном ядре: все ${detail.length} в режимах без признака public core`

  const modes = [...new Set(rest.map((item) => item.mode_id))].sort()
  const modeText = `${modes.length > 1 ? 'в режимах' : 'в режиме'} ${modes.join(' и ')}`
  const restText = `${rest.length} ${plural(rest.length, ['сервисом', 'сервисами', 'сервисами'])} ${modeText}`
  /* Сказуемое согласуется с подлежащим — числом лотов в ядре, а не дополнений. */
  return `${capitalize(coreText)} ${core.length === 1 ? 'дополнен' : 'дополнены'} ${restText}`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
