import { useRouteError } from 'react-router-dom'

import { getErrorMessage } from '../lib/getErrorMessage'

export default function ErrorPage() {
  const error = useRouteError()
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-center text-[15px] text-ink-500">
      {getErrorMessage(error)}
    </main>
  )
}
