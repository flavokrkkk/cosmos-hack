import {
  Factory, Fire, Leaf, MapTrifold, Mountains, Planet, RocketLaunch, Tractor, Truck, type Icon,
} from '@phosphor-icons/react'

import type { AccessMode, Lot } from '@shared/api/contracts'

/**
 * Иконка лота по идентификатору из каталога — набор Phosphor (https://phosphoricons.com),
 * которым пользовался дизайнер, начертание `fill`. Незнакомый лот получает ракету:
 * набор восьми лотов задан кейсом, но код не должен падать на девятом.
 */
const LOT_ICONS: Record<string, Icon> = {
  FIRE: Fire,
  FLOOD: Mountains,
  AGRI: Tractor,
  INFRA: Factory,
  ARCTIC: MapTrifold,
  TRANS: Truck,
  ENV: Leaf,
  SSA: Planet,
}

export function lotIcon(lotId: string): Icon {
  return LOT_ICONS[lotId] ?? RocketLaunch
}

/**
 * Расшифровка групп космических возможностей — стандартные значения аббревиатур,
 * а не трактовка кейса. PNT и InSAR в проверке разнообразия считаются одной группой.
 */
const CAPABILITY_TITLES: Record<string, string> = {
  EO: 'Дистанционное зондирование Земли (Earth Observation)',
  'PNT/InSAR': 'Навигация и позиционирование (PNT) / радарная интерферометрия (InSAR)',
  SATCOM: 'Спутниковая связь (SATCOM)',
  SSA: 'Контроль космической обстановки (Space Situational Awareness)',
}

export function capabilityTitle(code: string): string {
  return CAPABILITY_TITLES[code] ?? code
}

/** «FLOOD · Дальний Восток» — подпись под названием лота. */
export function lotSubtitle(lot: Lot): string {
  return `${lot.lot_id} · ${lot.territory_title}`
}

/** Коэффициент режима как «×1,05». */
export function formatFactor(value: number): string {
  return `×${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}`
}

/**
 * Описание режима только из его коэффициентов. Названий вроде «бесплатный» или
 * «коммерческий» в данных кейса нет (README §6), и придумывать их нельзя.
 */
export function describeMode(mode: AccessMode): string {
  const parts = [
    `C0 ${formatFactor(mode.k_c0)}`,
    `OPEX ${formatFactor(mode.k_opex)}`,
    `VPUB ${formatFactor(mode.k_vpub)}`,
    `якорные ${formatFactor(mode.k_anchor)}`,
    `коммерческие ${formatFactor(mode.k_commercial)}`,
  ]
  const core = mode.public_core ? 'общественное ядро' : 'без признака общественного ядра'
  return `Режим ${mode.mode_id} — ${core}. Коэффициенты к исходным значениям: ${parts.join(', ')}.`
}
