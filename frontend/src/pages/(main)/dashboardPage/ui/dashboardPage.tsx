import { Suspense, useEffect, useState } from 'react'

import { useCatalog } from '@entities/case'
import { effectiveCatalog, useWorkspace } from '@entities/portfolio'
import { Button, Panel } from '@shared/ui'
import { ModeSwitch, PageFooter } from '@widgets'

import { AutoScreen } from './autoScreen'
import { LazySavedVariantsDialog } from './lazyDialogs'
import { ManualScreen } from './manualScreen'
import { PageSkeleton } from './pageSkeleton'

/**
 * Одна страница инструмента: переключатель «Автоподбор / Ручная проверка»,
 * экран режима и версия данных внизу.
 *
 * Состояние страницы живёт в sessionStorage, результаты расчётов — в кеше
 * запросов; версия данных из каталога привязывает и то, и другое.
 */
export default function DashboardPage() {
  const catalog = useCatalog()
  const mode = useWorkspace((state) => state.mode)
  const bindDataset = useWorkspace((state) => state.bindDataset)
  const boundHash = useWorkspace((state) => state.datasetHash)
  const calculationInputs = useWorkspace((state) => state.calculationInputs)
  const [savedOpen, setSavedOpen] = useState(false)
  const [savedMounted, setSavedMounted] = useState(false)

  const datasetHash = catalog.data?.dataset_hash
  useEffect(() => {
    if (datasetHash) bindDataset(datasetHash)
  }, [datasetHash, bindDataset])

  if (catalog.isPending) return <PageSkeleton />

  if (catalog.isError || !catalog.data) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <Panel className="w-full max-w-[560px] text-center">
          <h1 className="text-[22px] font-bold">Каталог не загрузился</h1>
          <Button className="mt-5" onClick={() => void catalog.refetch()} loading={catalog.isFetching}>
            Повторить
          </Button>
        </Panel>
      </main>
    )
  }

  /* Пока состояние не привязано к текущей версии данных, экраны не рисуем:
     иначе запрос с чужим dataset_hash получит 409. */
  const bound = boundHash === catalog.data.dataset_hash
  const currentCatalog = effectiveCatalog(catalog.data, calculationInputs)

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-12 px-6 pt-12 pb-10 sm:px-8 lg:px-12 xl:px-16">
      <ModeSwitch
        onOpenSaved={() => {
          setSavedMounted(true)
          setSavedOpen(true)
        }}
      />

      {bound ? (
        mode === 'auto'
          ? <AutoScreen catalog={currentCatalog} officialCatalog={catalog.data} />
          : <ManualScreen catalog={currentCatalog} officialCatalog={catalog.data} />
      ) : null}

      <PageFooter catalog={catalog.data} />

      <Suspense fallback={null}>
        {savedMounted ? (
          <LazySavedVariantsDialog open={savedOpen} onOpenChange={setSavedOpen} datasetHash={catalog.data.dataset_hash} />
        ) : null}
      </Suspense>
    </main>
  )
}
