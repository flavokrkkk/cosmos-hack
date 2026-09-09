import { useViewer } from '@entities/viewer/model'

export default function DashboardPage() {
  const { currentUser } = useViewer()

  return (
    <main className="home-page">
      <section className="home-page__content">
        <p className="home-page__eyebrow">Cosmos Hack</p>
        <h1>Каркас приложения готов</h1>
        <p>Вы вошли как {currentUser?.username}.</p>
      </section>
    </main>
  )
}
