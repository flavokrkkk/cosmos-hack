# КосмоХакатон Нижний Новгород — команда «ТЧК MISIS»

## Принятый гибрид и комплект для проверки — 12.09.2026

Текущая реализация использует единственный `hybrid_maximin_v1`: максимум Q → максимум S; при явно заданном Δ сначала применяется денежное ограничение. Шесть шкал и автоматический Δ раскрыты в [обосновании](docs/22-hybrid-selection.md). По умолчанию алгоритм выбирает FIRE:A, AGRI:C, TRANS:C, ENV:A; S=92,25 млн ₽/год, Q=0,5, Δ=9,5 млн ₽/год. Старые описания ниже сохранены как история разработки.

Автономный расчётный комплект по пункту 13 инструкции: [team-submission/README.md](team-submission/README.md). Он запускается без API, Ollama, регистрации и ключей. Финальная записка и презентация проверяются отдельно по перечню материалов в комплекте.

```bash
python -m engine recommend
python -m engine recommend --delta 5
python -m engine evaluate --scenario STRESS
python scripts/build_submission.py
```


Кейс 02 «Космос как инфраструктура», кейсодержатель АНО «КЭП».
Межрегиональный портфель космических сервисов общего пользования: 11–13 сентября 2026.

## Быстрый запуск для проверки

Нужен Docker Desktop (macOS/Windows) или Docker Engine с Compose (Linux).
Из корня чистого checkout:

```bash
docker compose up -d --build --wait
```

Откройте **http://localhost:5173**. API и Swagger: **http://localhost:8000/docs**.
По умолчанию запускаются только frontend и backend, **Ollama отключена**.
Все расчёты, проверки BASE/STRESS, изменение лотов и режимов, сравнение,
сохранение и экспорт работают без LLM. Пояснения формируются сразу из расчётных
данных и помечаются как шаблонные. Регистрация, личные API-ключи, PostgreSQL,
Redis и платные сервисы не нужны.

Первой сборке нужен интернет для зависимостей и Docker-образов. Модель не
скачивается. После сборки и при наличии образов расчёты работают локально.

### Включить или отключить Ollama

Для удобного переключения есть скрипт на стандартной библиотеке Python
(подходит Python 3.9+, для расчётного CLI нужен Python 3.12):

```bash
python3 scripts/run_local.py --ollama off   # без модели, даже если в .env включена LLM
python3 scripts/run_local.py --ollama on    # Ollama в Docker + загрузка модели
python3 scripts/run_local.py --ollama host  # Ollama уже установлена на этой машине
```

В Windows используйте `python` вместо `python3`. Скрипт не переписывает `.env`,
пересоздаёт backend с выбранной настройкой и не удаляет загруженные модели.
`off` останавливает только контейнеры Ollama этого Compose-проекта; установленную
на компьютере Ollama не трогает.

В режиме `on` скачивается публичная `qwen3:4b-instruct` (около 2,5 ГБ), затем
хранится в volume `ollama-data`. Повторное включение использует этот кеш.
Пока загрузка или генерация не завершена, численные результаты доступны.
Прогресс загрузки: `docker compose logs -f ollama-pull`.

В режиме `host` заранее установите Ollama и выполните `ollama pull qwen3:4b-instruct`.
Backend обращается к `http://host.docker.internal:11434`; на Linux Ollama должна
принимать подключения от Docker. Собственный адрес задаётся через
`--ollama-url http://АДРЕС:11434`. На Mac установленная Ollama может использовать
GPU, а Docker Desktop не предоставляет ей GPU passthrough.
[Официальная документация Ollama](https://docs.ollama.com/faq).

Явный выбор модели: `python3 scripts/run_local.py --ollama on --model qwen3:4b-instruct`.
Для отдельного экземпляра: `--project-name cosmos-demo --env-file /путь/к/настройкам.env`.
Состояние режима: **http://localhost:8000/health**, поле `capabilities.ollama_enabled`.
Это настройка вызовов модели, а не обещание, что модель уже скачана и отвечает.

**Веса модели в Git не включаются.** Перенос в Git не уменьшит объём загрузки;
GitHub блокирует обычные файлы больше 100 MiB. Для нашего проверяемого результата
модель необязательна, поэтому достаточно опциональной загрузки и сохраняемого
volume. [Лимиты GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github),
[хранение Ollama в Docker](https://docs.ollama.com/docker).

### Что проверить в интерфейсе

1. Запустить автоподбор и сверить состав с текущей рекомендацией.
2. Открыть «Изменить лоты и режимы», изменить A/B/C или лот и пересчитать.
3. Проверить BASE и STRESS, включая вариант с нарушением: видны порог, факт и PASS/FAIL.
4. Сопоставить исходный и изменённый варианты, сохранить или выгрузить расчёт.

Поиск среди 4–8 кандидатов сохраняется; итоговый портфель содержит ровно четыре
лота. Прямой редактор проверяет именно введённый состав, без скрытого подбора
других режимов. Подробные контракты — [backend/README.md](backend/README.md),
фронтенд — [frontend/README.md](frontend/README.md).

«Исходные данные» открывает редактор всех восьми лотов и коэффициентов режимов
A/B/C. Изменения действуют как явный сценарий текущей сессии и запускают новый
расчёт; официальные файлы кейса не перезаписываются. Кнопка «Вернуть официальные»
сбрасывает сценарий.

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
python -m pytest tests/ -q    # проверки формул, границ, фронта и сверки документов с расчётом
```

Условия поиска задаются **без правки кода** в [`config/decision.json`](config/decision.json), точный состав для проверки —
флаг `--portfolio FIRE:A,AGRI:A,TRANS:A,ENV:A`. Контракт для backend и что делать нельзя —
[`engine/README.md`](engine/README.md). Разбор пространства решений —
[docs/research/portfolio-space.md](docs/research/portfolio-space.md).

## Материалы решения и как сверить цифры

Требование кейсодержателя: цифры в записке, на слайдах и в выводе кода **обязаны совпадать**.
Поэтому источник у них один, и совпадение проверяется тестом, а не на глаз.

| Материал | Где |
|---|---|
| **Управленческая записка**, 12 страниц + приложения | [docs/management-note.pdf](docs/management-note.pdf), исходник [docs/23-management-note.md](docs/23-management-note.md) |
| **Резюме стресс-сценария**, одна страница | [docs/stress-summary.pdf](docs/stress-summary.pdf), исходник [docs/24-stress-summary.md](docs/24-stress-summary.md) |
| Как вычислен портфель | [docs/22-hybrid-selection.md](docs/22-hybrid-selection.md) |
| Рекомендуемый портфель и результат выбора | [results/hybrid_analysis.json](results/hybrid_analysis.json) |
| Контрольные выгрузки | [results/](results) |
| Автономный комплект по п. 13 | [team-submission/](team-submission) |

Записки `docs/10-` и `docs/11-` — историческая версия под прежний портфель, в сдачу не входят.

Сверка чисел автоматизирована: `python scripts/sync_documents.py` сравнивает величины
в документах с выгрузками движка, `--fix` подставляет новые значения. Вёрстка PDF и контроль
объёма — `python scripts/render_pdf.py`.

**Версия исходных данных.** Файлы в [`case/source/`](case/source) побайтово совпадают с
публичным репозиторием кейсодержателя <https://github.com/SpaceEconomyPolicy/test>,
ветка `main`, коммит `3fa773b8` от 11.09.2026 01:14 UTC. Проверяется так:

```bash
git hash-object case/source/data/lots.csv        # 30cff39e…
git hash-object case/source/case_core.py         # 8fd3e053…
```

Сводный `dataset_hash` этого набора, который бэкенд отдаёт в `GET /portfolio/catalog`
и который показан в подвале интерфейса:
`1700fdbd1f2d51b7b639304323147dfa592a71d541c9ea723dca32b66fe38f22`. Другое значение
означает другие исходные данные.

**Как воспроизвести любое число записки:**

```bash
python -m engine evaluate --scenario STRESS    # девять проверок, разделы 1 и 7 записки
python -m engine space                         # 5670 / 1031 / 143, разделы 5.1–5.2
python -m engine pareto --scenario STRESS      # недоминируемые варианты, раздел 5.3
python -m engine sensitivity --scenario STRESS # границы слома, раздел 7
python -m engine export                        # все выгрузки в results/
python -m pytest tests/ -q                     # формулы, границы, фронт и сверка с документами
```

| Число в записке | Откуда берётся |
|---|---|
| C0, OPEX, VPUB, CASH, KCASH и индексы текущего портфеля | `results/portfolio_metrics.json` |
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

## Приложения и настройки

- `frontend/` — React + TypeScript + Vite, слои `app`, `pages`, `widgets`,
  `features`, `entities`, `shared`; публичный дашборд без авторизации.
- `backend/` — FastAPI; маршруты `/portfolio/{catalog,evaluate,recommend,compare,explain}`
  и `/portfolio/compare/analyze`. Числа вычисляет Python, LLM только объясняет готовые факты.
- `docker-compose.yml` — frontend и backend; необязательные профили `container-llm` и `tunnel`.
- `docker-compose.local.yml` — отдельная Ollama для запуска приложений напрямую на машине.

Настройки можно скопировать из примера:

```bash
cp .env.example .env
```

`COSMOS_WEB_HOST_PORT` и `COSMOS_API_HOST_PORT` меняют внешние порты.
`COSMOS_OLLAMA_ENABLED` включает обращения к LLM; `COSMOS_OLLAMA_BASE_URL` задаёт её адрес
**из контейнера backend**; `COSMOS_OLLAMA_MODEL` — модель. Браузер вызывает только FastAPI.
Для ручного запуска модели в контейнере задайте `COSMOS_OLLAMA_ENABLED=true`,
`COSMOS_OLLAMA_BASE_URL=http://ollama:11434` и выполните:

```bash
docker compose --profile container-llm up -d --build
```

Чтобы отключить LLM независимо от содержимого `.env`, используйте скрипт `run_local.py --ollama off`.
Полная остановка, включая профили Ollama и туннеля: `docker compose --profile '*' down`.
Используйте те же `--project-name` / `--env-file`, если задавали их при запуске.
**Без `-v`** кеш модели сохраняется.
Ollama в основном Compose доступна на `127.0.0.1:11435`, чтобы не занимать стандартный
порт установленной Ollama. Между контейнерами используется `ollama:11434`.

Туннель для демонстрации необязателен и не участвует в проверке локального запуска:

```bash
docker compose --profile tunnel up -d tuna
```

Его `TUNA_DOMAIN` и `TUNA_TOKEN` задаются в личном `.env`; секреты в репозиторий не входят.

### Проверки разработчика

Python 3.12 и зависимости из `backend/requirements-dev.txt`, Node.js 22 и `npm ci` в `frontend/`:

```bash
backend/.venv/bin/python -m pytest tests/ backend/tests/ -q
backend/.venv/bin/python -m engine selfcheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

Версии основных Python-зависимостей зафиксированы в `backend/requirements.txt`,
фронтенда — в `frontend/package-lock.json`. Автономный комплект
[team-submission/](team-submission/) запускается вообще без Docker и Ollama по своему README.

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
