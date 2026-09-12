# Frontend

React 19 + TypeScript + Vite. Одна страница — **инструмент подбора портфеля** по макетам
дизайнера: режимы «Автоподбор» и «Ручная проверка», проверка BASE/STRESS, сравнение,
сохранение вариантов, экспорт и объяснение расчёта.

**Авторизации нет.** Портфельные маршруты бэкенда открыты, и по README кейсодержателя
(§14, сценарий 5 «Доступ без авторов») эксперт должен запускать решение без логина.

## Стек

| Задача | Чем решаем |
|---|---|
| Роутинг | `react-router-dom` — один маршрут `/` в `pages/routes.tsx` |
| Серверное состояние | `@tanstack/react-query` + персистер кеша в `sessionStorage` |
| Состояние страницы | `zustand` с `persist`: рабочее состояние — `sessionStorage`, сохранённые варианты — `localStorage` |
| HTTP | `axios` — один клиент `apiClient` в `shared/api`, без интерцепторов |
| Стили | **Tailwind CSS v4**: токены дизайн-системы в `@theme` (`shared/styles/index.css`) |
| Примитивы UI | **Radix** (`radix-ui`: Dialog, Switch, Tooltip, ToggleGroup, Collapsible) — доступность, фокус, Esc |
| Варианты компонентов | `class-variance-authority` + `clsx` + `tailwind-merge` (`cn()`) |
| Иконки | `@phosphor-icons/react` — набор дизайнера (phosphoricons.com); лоты в начертании `fill` |
| Шрифт | `@fontsource-variable/inter` — самохостинг, без внешних CDN |
| Формы | `react-hook-form` + `yup` (диалог «Сохранить вариант») |
| Ошибки и тосты | `sonner` + единый `ApiError`, глобальный перехват в `QueryCache`/`MutationCache` |
| Линт | `oxlint` |

Компоненты `shared/ui` написаны под нашу дизайн-систему (подход shadcn: примитивы Radix +
собственная разметка), а не скопированы из чужой темы.

## Производительность и загрузка

- Первый шаг подбора предзагружается сразу после каталога (`usePrefetchRecommendation`):
  клик «Подобрать портфель» показывает карточки мгновенно; объяснения — вторым запросом.
- Диалоги (сравнение, сохранение, список сохранённых) — отдельные чанки, монтируются при
  первом открытии и подгружаются заранее по наведению на кнопки действий (`lazyDialogs.ts`).
- Вендоры разложены по чанкам `react` / `ui` / `data` (`vite.config.ts`), формы едут вместе с
  диалогом сохранения; первая отрисовка — скелет страницы, а не спиннер.
- Тонкий скролл, плавный якорный скролл, `prefers-reduced-motion` отключает анимации.

## Дизайн-система

Все сырые значения — в `shared/styles/index.css`, блок `@theme`; компоненты используют роли:

- **Бренд** `--color-brand: #0091FF`; поверхности `page → panel → card → tile`
  (страница, мягкий контейнер раздела, белая карточка, плитка показателя);
- статусы `pass / fail / warn` — фон и текст, в интерфейсе всегда дублируются словом;
- радиусы `panel 28 / card 22 / tile 16 / chip 14`, тени мягкие холодные (`shadow-panel`,
  `shadow-card`, `shadow-tile`, `shadow-brand` для главной кнопки);
- анимации оверлеев — `animate-fade-in`, `animate-pop-in`; центрирование модалки делают
  утилиты `translate`, поэтому keyframes анимируют только `opacity` и `scale`.

Кнопка — пилюля: `primary` (синяя со свечением) и `secondary` (белая с тенью) никогда не
стоят рядом одинаково окрашенными. Сегментированные переключатели — `Segmented`
(`lg` для режима страницы, `sm` для BASE/STRESS).

## Слои (FSD)

```text
app -> pages -> widgets -> features -> entities -> shared
```

Верхние слои импортируют нижние, не наоборот. Экраны режимов лежат на уровне страницы:
`pages/(main)/dashboardPage/ui/autoScreen.tsx` и `manualScreen.tsx` собирают виджеты.

| Слой | Что внутри |
|---|---|
| `shared/ui` | Button, Panel/Card/Tile, Tag, Segmented, Switch, Dialog, Tooltip, StatTile, Skeleton, Collapsible, IconButton, ModeBadge, SectionHeading, TextField, Toaster |
| `shared/api` | `apiClient`, `queryClient` + `persistOptions`, `ApiError`, `contracts.ts` — зеркало DTO |
| `entities/case` | каталог: `useCatalog`, `LotCard`, `RecommendedLotCard`, `LotDetailDialog`, `LotIcon`, `CapabilityTags`, стор модалки `useLotDetails`, презентация лота (иконки, расшифровки, описание режима по коэффициентам) |
| `entities/portfolio` | запросы `useRecommendation` / `useRecommendationExplanations` / `useEvaluate` / `useCompare` / `useComparisonAnalysis`, сторы `useWorkspace` (сессия) / `useSavedVariants` (localStorage) / `useComparison`, форматирование, выгрузка `snapshot.ts`, UI: `PortfolioLotCard`, `LotChip`, `MetricTiles`, `ExtraMetrics`, `ScenarioHeadroom`, `PortfolioProgress`, `ConstraintTiles`, `FeasibilityBadge` |
| `features` | `recommend-portfolio` (автоподбор и подбор режимов в два шага, открытый вариант, `explanationFor`, тумблер STRESS, счётчики), `edit-portfolio` (ручной выбор), `compare-portfolios` (кандидаты + диалог с AI-анализом), `save-variant` (диалоги сохранения и списка), `export-calculation` |
| `widgets` | `ModeSwitch`, `PortfolioReview` (текущий портфель + проверка + ограничения + действия), `Alternatives`, `ExplanationBlock`, `LotDetailsHost`, `SolutionMaterials`, `PageFooter` |

Алиасы настроены и в `vite.config.ts`, и в `tsconfig.app.json`:
`@`, `@app`, `@pages`, `@widgets`, `@features`, `@entities`, `@shared`.

## Контракт с бэкендом

`shared/api/contracts.ts` — **зеркало `backend/app/core/dto/portfolio.py`**: имена полей
и литералы совпадают буква в букву. `dataset_hash` из каталога обязателен во всех запросах.

| Маршрут бэкенда | Где вызывается |
|---|---|
| `GET /portfolio/catalog` | `entities/case` → `useCatalog()` |
| `POST /portfolio/recommend` (`with_explanations: false`) | `useRecommendation()` — числа и фронт за доли секунды: полный автоподбор (`lot_ids: null`) и подбор режимов для четырёх ручных лотов |
| `POST /portfolio/recommend` (`with_explanations: true`) | `useRecommendationExplanations()` — второй запрос за пакетным объяснением всех вариантов; блок «Почему такой выбор?» ждёт его отдельно |
| `POST /portfolio/evaluate` | `useEvaluate()` — пересчёт сохранённого варианта и прогресс сборки при 1–3 лотах |
| `POST /portfolio/compare` | `useCompare()` — диалог сравнения |
| `POST /portfolio/compare/analyze` | `useComparisonAnalysis()` — AI-анализ сравнения по кнопке внутри диалога |

Семантика ответа `recommend` после правки бэкенда 12.09: `recommended` — **портфель команды**
(если лежит на фронте области поиска), `alternatives` — **опорные точки фронта**. Интерфейс
нигде не называет их «рекомендацией алгоритма»; если портфеля команды нет, по умолчанию
открыта первая опорная точка и это сказано словами.

Объяснения приходят в том же ответе `recommend` (`variant.explanation`), но только при
`with_explanations: true`. Поэтому подбор идёт в два шага: первый запрос без объяснений
показывает числа сразу, второй — тот же ключ плюс объяснения — заполняет блок «Почему такой
выбор?» когда ответит модель; шаблонный ответ при недоступной Ollama помечается и не персистится.

## Состояние и сохранение «в рамках сессии»

Хранятся только **входы**; числа всегда считает бэкенд.

- `useWorkspace` (`entities/portfolio/model/workspace.ts`, `sessionStorage`): режим страницы,
  сценарий просмотра, условие STRESS, факт запуска автоподбора и его условие, открытый вариант
  для каждого режима, выбранные вручную лоты, запрошенные объяснения. Привязан к `dataset_hash`:
  другая версия данных — состояние сбрасывается (`bindDataset`).
- Кеш React Query персистируется в `sessionStorage` (`persistOptions` в `shared/api/queryClient.ts`).
  Ключи `recommend`/`evaluate`/`explanation` включают `dataset_hash` и нормализованный состав,
  `staleTime: Infinity` — расчёт детерминирован. После перезагрузки вкладки результат на месте
  без запроса; новая вкладка начинает с чистого листа.
- `useSavedVariants` (`localStorage`): «Сохранить вариант» хранит состав, режимы, `dataset_hash`,
  `engine_version`, `input_hash` и снимок допустимости для списка; при открытии вариант
  пересчитывается через `evaluate`, чужая версия данных помечается.
- Недоступное хранилище (приватный режим) не ломает приложение: персистер просто не создаётся.

## Три правила, которые нельзя нарушать в UI

1. **Исходные и пересчитанные числа подписаны отдельно.** Каталог показывает исходные
   значения; веер открытого варианта — значения после режима (подпись режима рядом);
   карточка лота в портфеле — «исходное × коэффициент = после режима»; модалка лота —
   «исходно N · ×k в режиме A». Все числа приходят с бэкенда, в браузере не умножают.
2. **Переключатель BASE/STRESS меняет только пороги.** Состав, режимы и цены не меняются;
   строка под показателями показывает лимит, факт и запас выбранного сценария.
   Тумблер «Искать только проходящие STRESS» — условие поиска: после первого запуска его
   смена сразу перезапускает подбор.
3. **`kcash` — покрытие расходов, не прибыль.** `vpub` не складывается с `cash`. Подписи
   закреплены в `entities/portfolio/lib/format.ts` (`METRIC_TILES`), менять без причины нельзя.

## Запуск

```bash
npm install
cp .env.example .env   # необязательно: без него VITE_API_URL = http://localhost:8000
npm run dev            # http://localhost:5173
```

Бэкенд поднимается отдельно — см. корневой [README](../README.md). CORS на бэкенде разрешает
`http://localhost:5173` и `:5174`. В контейнере фронт собирается с `VITE_API_URL=/api`.

## Проверки

```bash
npm run lint
npm run build
```

`tsc -b` включён в `build` и работает со строгими `noUnusedLocals` / `noUnusedParameters`.
