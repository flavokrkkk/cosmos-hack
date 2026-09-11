import { yupResolver } from '@hookform/resolvers/yup'
import { useForm } from 'react-hook-form'
import * as yup from 'yup'

import { applyApiErrorToForm } from '@shared/lib/form'
import { notifyApiError } from '@shared/lib/notify'
import { ERouteNames } from '@shared/lib/routeVariables'
import { TextField } from '@shared/ui'

import { useLogin } from '../../hooks'

const loginSchema = yup.object({
  username: yup.string().trim().required('Введите логин'),
  password: yup
    .string()
    .required('Введите пароль')
    .min(8, 'Пароль не короче 8 символов'),
})

type LoginFormValues = yup.InferType<typeof loginSchema>

const LOGIN_FIELDS = ['username', 'password'] as const

export function LoginForm() {
  const login = useLogin()
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<LoginFormValues>({
    resolver: yupResolver(loginSchema),
    defaultValues: { username: '', password: '' },
    mode: 'onTouched',
  })

  const submit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values)
      window.location.assign(ERouteNames.DEFAULT_ROUTE)
    } catch (error) {
      // Ошибки валидации раскладываем под поля; общие (401, 500, сеть) — тостом.
      // Так одно и то же сообщение не показывается дважды.
      const shownInFields = applyApiErrorToForm(error, setError, LOGIN_FIELDS)
      if (!shownInFields) notifyApiError(error)
    }
  })

  return (
    <form className="login-form" noValidate onSubmit={submit}>
      <h1>Вход</h1>

      <TextField
        autoComplete="username"
        error={errors.username?.message}
        label="Логин"
        {...register('username')}
      />

      <TextField
        autoComplete="current-password"
        error={errors.password?.message}
        label="Пароль"
        type="password"
        {...register('password')}
      />

      <button disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Входим…' : 'Войти'}
      </button>
    </form>
  )
}
