import { useViewer } from '@entities/viewer/model'

export default function DashboardPage() {
  const { currentUser } = useViewer()

  return (
    <main className="page">
      <section className="page__panel">
        <p className="page__eyebrow">КосмоХакатон · Кейс 02</p>
        <h1>Каркас приложения готов</h1>
        <p className="page__muted">
          Здесь будет советник по портфелю сервисных лотов.
        </p>
        {currentUser ? (
          <p className="page__muted">Вы вошли как {currentUser.username}.</p>
        ) : null}
      </section>
    </main>
  )
}
