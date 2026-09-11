# cosmoshack — КосмоХакатон Нижний Новгород (11–13 сентября 2026)

Кейс 02 «Сервисная модель космической экономики» (АНО «КЭП»). Цель — победа.

## Реализация приложения — актуализация 12.09

Добавлен backend-срез: портфельный API с автоподбором, альтернативами,
проверками BASE/STRESS, сравнением и синхронным объяснением через Ollama.
Фронтенд не реализован; исходный каркас сохранён.
Расчётное ядро теперь находится в
`backend/app/core/services/portfolio_engine`; корневой `engine` — совместимость прежнего CLI.
Исторические описания стартового каркаса ниже не отражают добавленные портфельные маршруты.

Запуск и контракты — [backend/README.md](backend/README.md) и
[frontend/README.md](frontend/README.md). Для проверки из корня:

```bash
backend/.venv/bin/python -m pytest tests/ backend/tests/ -q
backend/.venv/bin/python -m engine selfcheck
```

Предварительно установить `backend/requirements-dev.txt` в Python 3.12.
Проверен 61 Python-тест, self-check, контейнерная сборка и реальный вызов Ollama.
Портфельный API стартует без PostgreSQL и Redis.
Сохранение решений, веб-экспорт, финальные материалы и расширения — следующие этапы.

## 🚀 Кейс опубликован: «Космос как инфраструктура»

Выбрать 4 из 8 сервисных лотов, назначить режимы доступа, проверить в BASE и STRESS,
обосновать финансирование и реализацию. Материалы организаторов — в [`case/`](case/)
(не изменять). **План действий — [docs/07-action-plan.md](docs/07-action-plan.md).**

Расчётное ядро готово:

```bash
python -m pip install -r requirements.txt
python -m engine evaluate     # портфель + PASS/FAIL по ограничениям, BASE и STRESS
python -m engine space        # полный перебор 5670 конфигураций
python -m engine sensitivity  # запас по входным данным и где портфель ломается
python -m pytest tests/ -q    # 23 проверки формул, границ и фронта
```

Портфель меняется **без правки кода** — [`config/decision.json`](config/decision.json) или
флаг `--portfolio FIRE:A,AGRI:A,TRANS:B,ENV:A`. Контракт для backend и что делать нельзя —
[`engine/README.md`](engine/README.md). Разбор пространства решений —
[docs/research/portfolio-space.md](docs/research/portfolio-space.md).

## Материалы решения и как сверить цифры

Требование кейсодержателя: цифры в записке, на слайдах и в выводе кода **обязаны совпадать**.
Поэтому источник у них один, и совпадение проверяется тестом, а не на глаз.

| Материал | Где |
|---|---|
| **Управленческая записка** | [docs/10-management-note.md](docs/10-management-note.md) |
| **Резюме стресс-сценария**, одна страница | [docs/11-stress-summary.md](docs/11-stress-summary.md) |
| Рекомендуемый портфель в машиночитаемом виде | [config/decision.json](config/decision.json) |
| Контрольные выгрузки | [results/](results) |

**Версия исходных данных.** Файлы в [`case/source/`](case/source) побайтово совпадают с
публичным репозиторием кейсодержателя <https://github.com/SpaceEconomyPolicy/test>,
ветка `main`, коммит `3fa773b8` от 11.09.2026 01:14 UTC. Проверяется так:

```bash
git hash-object case/source/data/lots.csv        # 30cff39e…
git hash-object case/source/case_core.py         # 8fd3e053…
```

**Как воспроизвести любое число записки:**

```bash
python -m engine evaluate --scenario STRESS    # девять проверок, разделы 1 и 7 записки
python -m engine space                         # 5670 / 1031 / 143, разделы 5.1–5.2
python -m engine pareto --scenario STRESS      # 60 недоминируемых, раздел 5.3
python -m engine sensitivity --scenario STRESS # границы слома, раздел 7
python -m engine export                        # все выгрузки в results/
python -m pytest tests/ -q                     # формулы, границы, фронт и сверка с документами
```

| Число в записке | Откуда берётся |
|---|---|
| `c0` 1153,0 · `opex` 316,75 · `vpub` 1330,4 · `kcash` 1,018 | `results/portfolio_metrics.json` |
| Расчёт по лотам, раздел 3 | `results/portfolio_detail.csv` |
| 5670 / 1031 / 143 и связывающие ограничения | `results/portfolio_space.csv` |
| Запасы по ограничениям, раздел 7 | `results/constraints_STRESS.csv` |
| Границы слома входов, раздел 7 | `results/sensitivity_STRESS.csv` |

Отдельный набор тестов сверяет **документы с движком**: если записка и расчёт разойдутся,
`tests/test_documents_match_engine.py` покажет это до защиты, а не на ней.

## 📌 База знаний → [`docs/`](docs/README.md)

Всё, что мы знаем, по кускам: событие · кейс и расшифровка · гипотезы с вердиктами · стратегия ·
рубрика/сдача/таймлайн · **дип-ресерч** (кейсодержатель, РФ-механизмы, международные модели,
экономика лотов, параметры движка). Начать с [docs/README.md](docs/README.md).

## Каркас приложений

- `frontend/` — React + TypeScript + Vite, слои `app`, `pages`, `widgets`,
  `features`, `entities`, `shared`. Одна страница — дашборд подбора портфеля,
  **без авторизации**: эксперт должен запускать решение без логина (README кейса §14);
- `backend/` — FastAPI с тем же разделением на `api`, `core` и
  `infrastructure`; маршруты `/portfolio/{catalog,evaluate,recommend,compare,explain}`;
- `docker-compose.yml` — полный запуск;
- `docker-compose.local.yml` — PostgreSQL, Redis и Ollama для разработки
  приложений напрямую на машине.

Полный запуск:

```bash
docker compose up --build
```

Команда поднимает frontend, backend, Taskiq worker, PostgreSQL, Redis и Ollama.
PostgreSQL, Redis и worker сохранены как инфраструктура исходного каркаса, но портфельные
расчёты и объяснение от них не зависят.
При первом запуске контейнер `ollama-pull` загрузит модель `qwen3:4b-instruct` (около
2,5 ГБ), поэтому первый старт будет дольше последующих. Модель сохраняется в
volume `ollama-data`.

Выбрать другую модель можно без правки compose:

```bash
COSMOS_OLLAMA_MODEL=qwen3:8b docker compose up --build
```

Для запуска backend и frontend на машине достаточно поднять Ollama:

```bash
docker compose -f docker-compose.local.yml up -d ollama
```

Модель по умолчанию **не качается** — загрузить её можно командой
`docker compose -f docker-compose.local.yml --profile llm up ollama-pull`.

### Быстрый путь: backend без PostgreSQL и Redis

Если модель уже загружена, достаточно:

```bash
docker compose up -d ollama
docker compose up -d --no-deps --build app
curl -s http://localhost:8000/health   # {"status":"ok"}
```

Для расчётных ручек таблицы не создаются. PostgreSQL подключается лениво только при вызове
старых административных auth-маршрутов. Redis и Taskiq worker для Case 02 не используются.
Swagger — http://localhost:8000/docs.

### Переменные окружения

```bash
cp .env.example .env
```

`.env` в репозиторий не коммитится. Публичный туннель `tuna` вынесен в профиль и по
умолчанию не стартует — иначе `docker compose up` падал у всех, у кого не заданы
`TUNA_DOMAIN` / `TUNA_TOKEN`. Запуск туннеля:

```bash
docker compose --profile tunnel up -d tuna
```

## Сервер + Ollama на Mac через ngrok

На Mac заранее загрузите модель и поднимите защищённый туннель:

```bash
ollama pull qwen3:4b-instruct
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
- Старый NDVI-плейбук удалён вместе с китом: относился к ростовскому кейсу. В истории репозитория,
  тег `ndvi-kit`.

## Материалы события

- Хаб серии: https://космохакатон.рф/ · площадка НН: https://нн.космохакатон.рф/
- Личный кабинет: https://xn--m1aa.xn--80aa2abijcbdyq6a.xn--p1ai/personal/profile
