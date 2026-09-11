# cosmoshack — КосмоХакатон Нижний Новгород (11–13 сентября 2026)

Кейс 02 «Сервисная модель космической экономики» (АНО «КЭП»). Цель — победа.

## 📌 База знаний → [`docs/`](docs/README.md)

Всё, что мы знаем, по кускам: событие · кейс и расшифровка · гипотезы с вердиктами · стратегия ·
рубрика/сдача/таймлайн · **дип-ресерч** (кейсодержатель, РФ-механизмы, международные модели,
экономика лотов, параметры движка). Начать с [docs/README.md](docs/README.md).

## Каркас приложений

- `frontend/` — React + TypeScript + Vite, слои `app`, `pages`, `widgets`,
  `features`, `entities`, `shared` как в `flowers_store`;
- `backend/` — FastAPI с тем же разделением на `api`, `core` и
  `infrastructure`; из прикладных API пока есть только авторизация;
- `docker-compose.yml` — полный запуск;
- `docker-compose.local.yml` — PostgreSQL, Redis и Ollama для разработки
  приложений напрямую на машине.

Полный запуск:

```bash
docker compose up --build
```

Команда поднимает frontend, backend, Taskiq worker, PostgreSQL, Redis и Ollama.
При первом запуске контейнер `ollama-pull` загрузит модель `qwen3:4b` (около
2,5 ГБ), поэтому первый старт будет дольше последующих. Модель сохраняется в
volume `ollama-data`.

Выбрать другую модель можно без правки compose:

```bash
COSMOS_OLLAMA_MODEL=qwen3:8b docker compose up --build
```

Для запуска backend и frontend на машине, а инфраструктуры в Docker:

```bash
docker compose -f docker-compose.local.yml up
```

## Сервер + Ollama на Mac через ngrok

На Mac заранее загрузите модель и поднимите защищённый туннель:

```bash
ollama pull qwen3:4b
ngrok http 11434 \
  --host-header="localhost:11434" \
  --basic-auth="cosmos:change-this-password"
```

Не публикуйте Ollama без авторизации. Оставьте Mac подключённым к питанию и
отключите сон на время демонстрации:

```bash
caffeinate -dimsu
```

На сервере создайте закрытый env-файл из примера, укажите публичные адреса
frontend, backend и ngrok, затем запустите compose без локальной Ollama:

```bash
cp .env.server.example .env.server
docker compose --env-file .env.server -f docker-compose.server.yml up --build -d
```

`docker-compose.server.yml` не публикует порты PostgreSQL и Redis. Frontend
обращается только к серверному FastAPI, а FastAPI вызывает Ollama через ngrok.
Файл `.env.server` с паролями не коммитьте.

## Кейсы НН

| | Кейс 01 | **Кейс 02 — наш** |
|---|---|---|
| Название | Проектирование устойчивой спутниковой группировки (ИНТЦ «АКИД») | **Сервисная модель космической экономики** (АНО «КЭП») |
| Суть | моделирование группировки, устойчивость при отказах | выбрать 4 из 8 сервисных лотов; на каждый — режим доступа, закупка/финансирование, риски, дорожная карта |

Подробно — [docs/01-case02-brief.md](docs/01-case02-brief.md).

## Что где

- Конвенции репо и слоёв — [AGENTS.md](AGENTS.md); что было готово до старта — [PREEXISTING.md](PREEXISTING.md).
- Правила для ИИ-агентов и ведения базы знаний — [CLAUDE.md](CLAUDE.md) (Claude Code) и раздел
  *Documentation and knowledge base* в [AGENTS.md](AGENTS.md) (все агенты и люди): всё новое знание —
  в `docs/` по маршрутизации, новых `.md` в корне не создавать.
- NDVI-кит под ростовский вегетационный кейс (бывший `ml/`) **снят** — Кейс 02 управленческий,
  машинное обучение не нужно. Код в истории, тег `ndvi-kit`:
  `git checkout ndvi-kit -- ml/`. Подробности — [PREEXISTING.md](PREEXISTING.md).
- Старый NDVI-плейбук — в архиве: [docs/archive/ndvi-playbook.md](docs/archive/ndvi-playbook.md).

## Материалы события

- Хаб серии: https://космохакатон.рф/ · площадка НН: https://нн.космохакатон.рф/
- Личный кабинет: https://xn--m1aa.xn--80aa2abijcbdyq6a.xn--p1ai/personal/profile
