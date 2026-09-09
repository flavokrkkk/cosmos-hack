# Frontend

React + TypeScript + Vite. Структура повторяет подход `flowers_store`:

- `app` — запуск и глобальные провайдеры;
- `pages` — страницы;
- `widgets` — крупные блоки страниц;
- `features` — пользовательские действия;
- `entities` — сущности, типы и предметный API;
- `shared` — общий UI, инфраструктура и утилиты.

Сохранён auth-срез исходной структуры: `entities/admin`, `entities/token`,
`entities/viewer`, login page, route guards, Axios-interceptor обновления токена и
React Query. Магазинные сущности отсутствуют.

```bash
npm install
cp .env.example .env
npm run dev
```

```bash
npm run lint
npm run build
```
