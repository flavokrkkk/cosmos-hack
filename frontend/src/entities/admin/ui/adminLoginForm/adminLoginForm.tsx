import { useState, type FormEvent } from 'react'

import { useAdminLogin } from '../../hooks'

export function AdminLoginForm() {
  const login = useAdminLogin()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await login.mutateAsync({ username, password })
    window.location.assign('/')
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <h1>Вход</h1>
      <label>
        Логин
        <input
          autoComplete="username"
          onChange={(event) => setUsername(event.target.value)}
          required
          value={username}
        />
      </label>
      <label>
        Пароль
        <input
          autoComplete="current-password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {login.error && <p className="form-error">{login.error.message}</p>}
      <button disabled={login.isPending} type="submit">
        {login.isPending ? 'Входим…' : 'Войти'}
      </button>
    </form>
  )
}
