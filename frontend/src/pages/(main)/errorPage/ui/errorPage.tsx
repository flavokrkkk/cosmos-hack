import { useRouteError } from 'react-router-dom'

import { Button, Panel } from '@shared/ui'

import { getErrorMessage } from '../lib/getErrorMessage'

/**
 * Граница ошибок маршрута: любая ошибка рендера показывает понятное сообщение
 * и кнопку перезагрузки вместо белого экрана. Состояние страницы хранится в
 * sessionStorage, поэтому после перезагрузки выбор пользователя не теряется.
 */
export default function ErrorPage() {
  const error = useRouteError()
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <Panel className="w-full max-w-[520px] text-center">
        <h1 className="text-[22px] font-bold">Что-то пошло не так</h1>
        <p className="mt-2 text-[14px] text-muted">{getErrorMessage(error)}</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>Перезагрузить страницу</Button>
      </Panel>
    </main>
  )
}
