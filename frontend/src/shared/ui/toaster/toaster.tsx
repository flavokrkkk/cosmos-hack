import { Toaster } from 'sonner'

/** Единственная точка вывода тостов. Монтируется один раз в провайдерах. */
export function AppToaster() {
  return (
    <Toaster
      closeButton
      duration={6000}
      position="top-right"
      richColors
      toastOptions={{
        style: { fontFamily: 'inherit', borderRadius: 18 },
      }}
    />
  )
}
