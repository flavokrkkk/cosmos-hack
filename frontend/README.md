# Frontend

React 19 + TypeScript + Vite. Одна страница — **дашборд подбора портфеля**: каталог
восьми лотов, автоподбор, ручная правка, показатели и девять проверок в BASE и STRESS.

**Авторизации нет.** Портфельные маршруты бэкенда открыты, и по README кейсодержателя
(§14, сценарий 5 «Доступ без авторов») эксперт должен запускать решение без логина
и личных ключей. Логин, гварды и токены удалены — были в стартовом каркасе.

## Стек

| Задача | Чем решаем |
|---|---|
| Роутинг | `react-router-dom` — один маршрут `/` в `pages/routes.tsx` |
| Серверное состояние | `@tanstack/react-query` |
| HTTP | `axios` — один клиент `apiClient` в `shared/api`, без интерцепторов |
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

## Контракт с бэкендом

`shared/api/contracts.ts` — **зеркало `backend/app/core/dto/portfolio.py`**: имена полей
и литералы совпадают с pydantic-моделями буква в букву, один файл на один файл.
Расхождение видно обычным диффом. Своих трактовок в нём нет.

| Маршрут бэкенда | Где вызывается |
|---|---|
| `GET /portfolio/catalog` | `entities/case` → `useCatalog()` |
| `POST /portfolio/evaluate` | `entities/portfolio` → `useEvaluate()` |
| `POST /portfolio/recommend` | `entities/portfolio` → `useRecommend()` |
| `POST /portfolio/compare` | `entities/portfolio` → `portfolioService.compare()` |

`dataset_hash` из каталога обязателен во всех запросах: бэкенд проверяет, что фронтенд
считает на той же версии данных.

## Что уже есть

- `entities/case` — каталог: `useCatalog()`, `LotCard`. Карточка показывает **исходные**
  значения лота, без коэффициентов режима.
- `entities/portfolio` — расчёт: `useEvaluate()`, `useRecommend()`, `MetricsTable`,
  `ConstraintsTable`, форматирование в `lib/format.ts`.
- `features/edit-portfolio` — `usePortfolioDraft()`: ручная копия портфеля. Рекомендация
  алгоритма в неё не мутируется, `replace()` создаёт копию.
- `features/recommend-portfolio` — `RecommendPanel`: правило выбора показывается **до**
  запуска, метод помечен как допущение команды.
- `shared/api` — `apiClient`, `queryClient` с глобальным перехватом ошибок,
  `ApiError` / `normalizeApiError`, `contracts.ts`.
- `shared/lib/notify` — `notifyApiError`, `notifySuccess`, `notifyInfo`;
  `shared/lib/form` — `applyApiErrorToForm`; `shared/ui/TextField` — поле формы.
  Форм на дашборде пока нет: это заготовка под конструктор, решение по RHF + yup
  зафиксировано в [docs/05-decisions.md](../docs/05-decisions.md).

## Три правила, которые нельзя нарушать в UI

Они взяты из README кейсодержателя и стоят баллов:

1. **Исходные и пересчитанные числа подписаны отдельно.** На карточке лота — каталог,
   в таблице портфеля — после коэффициентов режима. Смешивать нельзя.
2. **Переключатель BASE/STRESS меняет только пороги.** Ни состав портфеля, ни режимы,
   ни цены лотов при этом не меняются — иначе это скрытая подмена решения.
3. **`kcash` — покрытие расходов, не прибыль.** `vpub` не складывается с `cash`.
   Формулировки закреплены в `entities/portfolio/lib/format.ts`, менять без причины нельзя.

## Формы: канонический пример

Схема на `yup`, типы выводятся из схемы через `InferType`, поля — через `register`.
Ошибки бэкенда раскладывает `applyApiErrorToForm`. Форм на дашборде пока нет —
шаблон ниже для конструктора портфеля.

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

Образец для копирования — `entities/case` (чтение) и `entities/portfolio` (чтение + действие):

1. **Типы и API** — типы берём из `shared/api/contracts.ts` (зеркало DTO бэкенда,
   своих не заводим), сервис — `entities/<сущность>/api/<сущность>Service.ts`,
   ходит через `apiClient`.
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
