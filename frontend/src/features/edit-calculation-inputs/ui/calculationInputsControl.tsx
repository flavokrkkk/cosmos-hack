import { lazy, Suspense, useState } from 'react'

import { changedInputCount, useWorkspace } from '@entities/portfolio'
import type { CaseCatalog } from '@shared/api/contracts'
import { Button } from '@shared/ui'

const LazyDialog = lazy(() => import('./calculationInputsDialog').then((module) => ({ default: module.CalculationInputsDialog })))

export function CalculationInputsControl({ officialCatalog }: { officialCatalog: CaseCatalog }) {
  const inputs = useWorkspace((state) => state.calculationInputs)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const changed = changedInputCount(officialCatalog, inputs)

  return (
    <>
      <Button variant="secondary" onClick={() => { setMounted(true); setOpen(true) }}>
        Исходные данные{changed ? ` · изменено ${changed}` : ''}
      </Button>
      <Suspense fallback={null}>
        {mounted ? <LazyDialog open={open} onOpenChange={setOpen} officialCatalog={officialCatalog} /> : null}
      </Suspense>
    </>
  )
}
