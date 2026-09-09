import { useRouteError } from 'react-router-dom'

import { getErrorMessage } from '../lib/getErrorMessage'

export default function ErrorPage() {
  const error = useRouteError()
  return <main className="message-page">{getErrorMessage(error)}</main>
}
