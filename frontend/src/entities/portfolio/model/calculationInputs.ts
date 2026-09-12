import type { CalculationInputs, CaseCatalog } from '@shared/api/contracts'

export function officialCalculationInputs(catalog: CaseCatalog): CalculationInputs {
  return {
    lots: catalog.lots.map((lot) => ({ ...lot, capability_groups: [...lot.capability_groups] })),
    modes: catalog.modes.map((mode) => ({ ...mode })),
  }
}

export function cloneCalculationInputs(inputs: CalculationInputs): CalculationInputs {
  return {
    lots: inputs.lots.map((lot) => ({ ...lot, capability_groups: [...lot.capability_groups] })),
    modes: inputs.modes.map((mode) => ({ ...mode })),
  }
}

export function effectiveCatalog(catalog: CaseCatalog, inputs: CalculationInputs | null): CaseCatalog {
  return inputs ? { ...catalog, lots: inputs.lots, modes: inputs.modes } : catalog
}

export function calculationInputsKey(inputs: CalculationInputs | null): string {
  return inputs ? JSON.stringify(inputs) : 'official'
}

export function changedInputCount(catalog: CaseCatalog, inputs: CalculationInputs | null): number {
  if (!inputs) return 0
  const official = officialCalculationInputs(catalog)
  let count = 0
  for (const lot of inputs.lots) {
    const base = official.lots.find((item) => item.lot_id === lot.lot_id)
    if (!base) continue
    for (const key of Object.keys(lot) as (keyof typeof lot)[]) {
      if (JSON.stringify(lot[key]) !== JSON.stringify(base[key])) count += 1
    }
  }
  for (const mode of inputs.modes) {
    const base = official.modes.find((item) => item.mode_id === mode.mode_id)
    if (!base) continue
    for (const key of Object.keys(mode) as (keyof typeof mode)[]) {
      if (mode[key] !== base[key]) count += 1
    }
  }
  return count
}
