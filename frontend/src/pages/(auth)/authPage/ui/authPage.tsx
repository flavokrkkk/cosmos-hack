import { Outlet } from 'react-router-dom'

export default function AuthPage() {
  return (
    <main className="auth-page">
      <Outlet />
    </main>
  )
}
