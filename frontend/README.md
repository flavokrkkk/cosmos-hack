# Frontend

React 19 + TypeScript + Vite. Стартер под Кейс 02 очищен от магазинных остатков
`flowers_store` и готов к тому, чтобы сразу после объявления кейса писать предметный код.

## Стек

| Задача | Чем решаем |
|---|---|
| Роутинг | `react-router-dom` (`pages/routes.tsx`, гварды в `entities/viewer`) |
| Серверное состояние | `@tanstack/react-query` |
| HTTP | `axios` — единый клиент в `shared/api` с auth-интерцептором |
| **Формы** | **`react-hook-form` + `yup`** через `@hookform/resolvers/yup` |
| **Ошибки и тосты** | `sonner` + единый `ApiError` в `shared/api`, глобальный перехват в `QueryCache`/`MutationCache` |
| Поля форм | `shared/ui/TextField` — подпись, инпут, ошибка, a11y |
| Стили | обычный CSS с токенами в `shared/styles/index.css` |
| Линт | `oxlint` |

## Слои (FSD)

```text
app -> pages -> widgets -> features -> entities -> shared
```

Верхние слои импортируют нижние, не наоборот. `shared` не содержит доменной логики.
Полные правила — в [AGENTS.md](../AGENTS.md).

Алиасы настроены и в `vite.config.ts`, и в `tsconfig.app.json`:
`@`, `@app`, `@pages`, `@widgets`, `@features`, `@entities`, `@shared`.
Длинные относительные пути не использовать.

## Что уже есть

- `entities/session` — авторизация: `useLogin`, `useCurrentUser`, `LoginForm`, типы.
  Бэкенд-маршруты `/admin/auth/*` — начальный контракт API (AGENTS.md), не меняются;
  сущность фронтенда нейтральная — `session`.
- `entities/viewer` — контекст текущего пользователя и гварды `privatePage` / `publicPage`.
- `shared/lib/token` — токены в localStorage. Раньше это была `entities/token`, и её
  импортировал `shared/api` — нарушение FSD (shared → entities). Токен перенесён в `shared`.
- `shared/api` — `axiosAuth` / `axiosNoAuth` (обновление токена по 401), `queryClient`
  с глобальным перехватом ошибок, `ApiError` / `normalizeApiError`.
- `shared/lib/notify` — `notifyApiError`, `notifySuccess`, `notifyInfo`;
  `shared/lib/form` — `applyApiErrorToForm`.
- `shared/ui/TextField` — переиспользуемое поле формы.
- `shared/lib/routeVariables` — имена маршрутов (`ERouteNames`), хардкодить пути не нужно.

`features/`, `widgets/` и доменные `entities` под лоты, портфель и сценарий **пусты
намеренно**: это кейс-код, он добавляется после брифинга отдельными коммитами. План —
[docs/06-engine-spec.md](../docs/06-engine-spec.md).

## Формы: канонический пример

Схема на `yup`, типы выводятся из схемы через `InferType`, поля — через `register`.
Ошибки бэкенда раскладывает `applyApiErrorToForm`. Образец для копирования:
`entities/session/ui/loginForm/loginForm.tsx`.

```tsx
const schema = yup.object({
  budget: yup.number().typeError('Число').required('Обязательно').positive('Больше нуля'),
})
type Values = yup.InferType<typeof schema>

const {
  formState: { errors, isSubmitting },
  handleSubmit,
  register,
  setError,
} = useForm<Values>({
  resolver: yupResolver(schema),
  defaultValues: { budget: 0 },
  mode: 'onTouched',
})

const submit = handleSubmit(async (values) => {
  try {
    await mutation.mutateAsync(values)
    notifySuccess('Сценарий сохранён')
  } catch (error) {
    // Валидация бэкенда — под поля, общие ошибки — тостом.
    if (!applyApiErrorToForm(error, setError, ['budget'])) notifyApiError(error)
  }
})

return (
  <form noValidate onSubmit={submit}>
    <TextField label="Бюджет" error={errors.budget?.message} {...register('budget')} />
    <button disabled={isSubmitting} type="submit">Сохранить</button>
  </form>
)
```

## Ошибки бэкенда: один обработчик на всё

Разбор ответов бэкенда живёт **в одном месте** — `shared/api/apiError.ts`.
`normalizeApiError()` приводит что угодно к `ApiError` со `status`, `message`
и `fieldErrors`, потому что FastAPI отдаёт ошибки в двух несовместимых формах:

| Ответ | Что делает нормализатор |
|---|---|
| `{"detail": "Invalid credentials"}` (401/403/404) | строка → сообщение, известные англоязычные тексты переводятся |
| `{"detail": [{"loc": ["body","username"], "msg": "..."}]}` (422) | массив → `fieldErrors`; типовые тексты pydantic переводятся |
| нет ответа (сеть, таймаут) | «Сервер недоступен. Проверьте, запущен ли backend» |
| прочее | фолбэк по HTTP-статусу |

> Раньше здесь было `new Error(detail)`, и массив объектов из 422 превращался
> в **«[object Object]»**. Это и был баг.

**Тосты показываются сами.** `queryClient` перехватывает ошибки глобально через
`QueryCache` / `MutationCache`, поэтому в компонентах ловить ошибку не нужно:

```tsx
const { data } = useQuery({ queryKey: ['portfolio', 'lots'], queryFn: getLots })
// упало — пользователь уже увидел тост
```

Тосты дедуплицируются по тексту: если десять запросов упали по одной причине,
тост будет один. Повтор (`retry`) выполняется только для сети и 5xx — на 4xx он бессмысленный.

Отключить тост там, где ошибка рисуется в интерфейсе:

```ts
useQuery({ queryKey, queryFn, meta: { skipErrorToast: true } })
useMutation({ mutationFn, meta: { errorMessage: 'Не удалось сохранить сценарий' } })
```

**В формах** ошибки валидации бэкенда ложатся под нужные поля по `loc`, а общие
показываются тостом — без дублирования:

```tsx
catch (error) {
  const shownInFields = applyApiErrorToForm(error, setError, ['username', 'password'])
  if (!shownInFields) notifyApiError(error)
}
```

Ручные уведомления: `notifySuccess`, `notifyInfo`, `notifyApiError` из `@shared/lib/notify`.

## Рецепт: новый вертикальный срез за 5 шагов

Когда объявят кейс и появятся лоты — добавляем срез по этому шаблону
(образец для копирования — `entities/session`):

1. **Типы и API** — `entities/<сущность>/types/apiTypes.ts` и
   `api/<сущность>Service.ts` (класс + экземпляр, ходит через `axiosAuth` / `axiosNoAuth`).
2. **Хуки** — `hooks/use*.ts` на React Query: `useQuery` для чтения, `useMutation` для записи.
   Ключи запросов — массивом: `['portfolio', 'lots']`.
3. **UI сущности** — `ui/…` (формы на RHF + yup, поля из `shared/ui`).
4. **Страница** — `pages/(main)/<страница>/` с `ui/` и баррелем `index.ts`,
   затем маршрут в `pages/routes.tsx` через `ERouteNames`.
5. **Баррели** — обновить `entities/<сущность>/index.ts` и `entities/index.ts`.

Крупные составные блоки страницы кладём в `widgets/`, пользовательские действия —
в `features/`.

## Запуск

```bash
npm install
cp .env.example .env   # необязательно: без него VITE_API_URL = http://localhost:8000
npm run dev            # http://localhost:5173 (или :5174, если порт занят)
```

Бэкенд поднимается отдельно — см. корневой [README](../README.md).
CORS на бэкенде разрешает `http://localhost:5173` и `:5174` (Vite сам переезжает на
запасной порт, если основной занят), прокси в Vite не нужен.

В контейнере фронт собирается с `VITE_API_URL=/api`, и nginx проксирует `/api/`,
`/docs`, `/redoc`, `/openapi.json` на `app:8000` — публичный origin остаётся один.

## Проверки

```bash
npm run lint
npm run build
```

`tsc -b` включён в `build` и работает со строгими `noUnusedLocals` /
`noUnusedParameters` — мёртвый код роняет сборку. Обе команды должны быть зелёными
перед коммитом.
