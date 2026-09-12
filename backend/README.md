# Backend

FastAPI-каркас повторяет слои `flowers_store`: `api`, `core`, `infrastructure`,
`utils`, `scripts` и `migrations`. Магазинные сущности и внешние интеграции не
переносились.

## API

- `POST /admin/auth/login`;
- `POST /admin/auth/refresh`;
- `GET /admin/auth/current_user`;
- `GET /health` — технический healthcheck.
- `GET /portfolio/catalog` — официальный каталог, режимы, пороги и метод выбора;
- `POST /portfolio/evaluate` — пересчёт 0–4 уникальных лотов и BASE/STRESS;
- `POST /portfolio/recommend` — автоподбор и альтернативы;
- `POST /portfolio/compare` — сравнение 2–4 полных портфелей;
- `POST /portfolio/explain` — сразу вернуть объяснение полного портфеля.

## Портфельный расчёт

Чистое ядро перенесено в `app/core/services/portfolio_engine/`; не импортирует FastAPI,
БД или Ollama. `PortfolioService` формирует каталог/расчёт/сравнение, `RecommendationService`
выбирает рекомендацию; DTO — в `core/dto/portfolio.py`. Корневой `engine/` содержит только
переходники для прежних импортов и CLI, не вторую реализацию.

Портфельные маршруты публичные: токен и вход не нужны. Авторизация `/admin/auth/*` сохранена;
`/admin/auth/current_user` без токена по-прежнему возвращает 403.
Браузер через nginx вызывает `/api/portfolio/*`, FastAPI обслуживает `/portfolio/*`.

В Swagger `/docs` можно сразу вызвать `GET /portfolio/catalog`, скопировать `dataset_hash`
и передать его в `POST /portfolio/recommend`. Нажимать Authorize не требуется.
Хранение черновика в браузере запланировано через localStorage, но пока не реализовано;
backend не сохраняет портфели и всегда сам пересчитывает клиентский selection.
Портфельные маршруты и `/health` запускаются без PostgreSQL и Redis. Соединение с PostgreSQL
создаётся лениво только при обращении к сохранённым административным auth-маршрутам.

`evaluate` принимает `dataset_hash` из каталога и `selection` вида
`[{"lot_id":"FIRE","mode_id":"A"}]`. Пустой выбор — `incomplete`, `metrics: null`;
1–3 лота — предварительные значения. Дубликаты, неизвестные ID, пятый лот и лишние поля — 422,
другая версия данных — 409. Нарушение бюджета — 200 с результатами проверок, не ошибка сервера.

`recommend` принимает `dataset_hash`, `require_stress` (по умолчанию true) и
`method_id: "pareto_lexicographic_v1"`. Ручной selection не нужен. После фильтрации/Парето:
VPUB больше, C0/OPEX меньше, KCASH/t_rep/readiness/resilience/scale больше, стабильный ID.
Значения не округляются до выбора. `config/decision.json` не используется как победитель.
`compare` принимает `variants` — список запросов evaluate; дельты относительно первого варианта.
Сервер не доверяет клиентским метрикам.

`recommend` также принимает `with_explanations` (по умолчанию `true`). С `false` ручка отдаёт
только расчёт и фронт без пакетного объяснения Ollama — доли секунды; `explanation` у вариантов
тогда `null`. Фронтенд вызывает ручку дважды: сначала без объяснений (числа сразу), затем
с объяснениями (модель отвечает до полутора минут на процессоре). На `input_hash` флаг не влияет.

### Ручной выбор лотов с автоматическими режимами

`POST /portfolio/recommend` также принимает необязательный `lot_ids`:
ровно четыре разных ID из catalog. Без поля или с null выполняется полный автоподбор
5670 конфигураций; с четырьмя ID рассматривается 81 назначение A/B/C только этим лотам.
Пустой список, 1–3 лота, дубликаты и неизвестные ID — 422. Пользователь режимы не передаёт.
Сортировка lot_ids нормализуется, поэтому порядок кликов не меняет результат и input_hash.

В ответе `request` повторяет нормализованные условия. `considered_count`, `base_count`,
`stress_count`, `feasible_count`, `pareto_count` относятся к текущей области поиска:
в ручном выборе это только указанные четыре лота. Рекомендация и альтернативы сохраняют
их состав, отличаются режимами. При отсутствии решения — status=no_feasible,
recommended=null, alternatives=[]; переключения на другие лоты нет.

`evaluate` остаётся низкоуровневым пересчётом точного selection с mode_id для проверки,
импорта и сравнения результатов. Это не основной запуск нового ручного экрана.
Его прежняя поддержка неполных наборов не означает, что подбор режимов работает для 1–3 лотов.

Полный перебор прогревается в lifespan вне event loop. HTTP-расчёты идут в thread pool через
синхронные обработчики FastAPI, без очереди. Кеши не отдают общие изменяемые объекты наружу.
Путь к исходникам — корневой `case/source` либо переменная окружения `COSMOS_CASE_SOURCE_DIR`,
заданная до старта процесса. Набор фиксирован до перезапуска. Официальные файлы не менялись.

Dockerfile собирается из корня repo, копирует только необходимые runtime-файлы без jury.
API не зависит от db, Redis, worker или завершения `ollama-pull`. Старые инфраструктурные
сервисы сохранены в compose как часть каркаса, но кейсовая логика их не вызывает.
Сборка и синхронный вызов API → Ollama проверены 12.09.2026.

Пока не реализованы сохранение пользовательских решений в PostgreSQL, веб-экспорт/импорт,
выдача финальных материалов и четыре расширения алгоритма. Предметное AI-пояснение уже
работает обычным HTTP-запросом; CLI-экспорт сохранён.

### Проверки

Из корня репозитория:

```bash
uv pip install --python backend/.venv/bin/python -r backend/requirements-dev.txt
backend/.venv/bin/python -m pytest tests backend/tests -q
cd backend
.venv/bin/python -m app.core.services.portfolio_engine selfcheck
PYTHONPYCACHEPREFIX=/tmp/cosmos-hack-pycache .venv/bin/python -m compileall -q app migrations
.venv/bin/python -c "from app.main import app; print(sorted(app.openapi()['paths']))"
```

После добавления объяснений прошёл 61 Python-тест, self-check, compileall и проверка OpenAPI.
API-тесты используют реальные публичные роуты без токена и подмены пользователя,
проверяют отсутствие security в OpenAPI и сохранение защиты административного маршрута.
Unit/API-тесты не доказывают работу внешних сервисов сами по себе, поэтому отдельно выполнен
Docker end-to-end вызов API → локальная Ollama. Отдельно проверен запуск `/health` и каталога
с недоступным адресом PostgreSQL. TestClient выдаёт предупреждения о deprecated
httpx/anyio-интерфейсах.

Контрольный локальный замер Python 3.12.14: холодный recommend STRESS — 3,909 с,
повторный — 0,0006 с (внутри сервиса, без HTTP/БД). Это один замер, не SLA;
поэтому полный перебор прогревается при старте, а не выполняется на event loop запроса.

Дополнительные зависимости расчёта/тестов: pandas 2.3.3 — BSD-3-Clause, pytest 8.4.2 — MIT,
httpx 0.28.1 — BSD-3-Clause. Установленный NumPy 2.5.3 декларирует
`BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0` для комплекта; см. его LICENSE/NOTICE.
Официальные данные и код получены от кейсодержателя, источник — `case/source/README.md`.
Новый датасет не добавлялся. Для объяснений установлена локальная модель
`qwen3:4b-instruct`; источник и лицензия указаны ниже.

## Локальный запуск

```bash
cp .env.example .env
uv venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/uvicorn app.main:app --reload
```

Для портфельных маршрутов база не нужна. Если вызвать сохранённые административные
auth-маршруты, backend лениво подключит PostgreSQL и создаст администратора из
`COSMOS_BOOTSTRAP_ADMIN_*`.

Конфигурация разделена по подсистемам: `AppSettings`, `DatabaseSettings`,
`JWTSettings`, `BootstrapSettings`, `RedisSettings` и `OllamaSettings`. Имена
переменных окружения `COSMOS_*` сохранены.

## Ollama

Ollama используется только для понятного текстового объяснения уже рассчитанного
портфеля. Модель не выбирает лоты, не выбирает A/B/C и не считает метрики.

- `OllamaClient` в `app/core/clients` отвечает только за HTTP `/api/chat`;
- `OllamaService.explain_portfolio()` собирает закрытый предметный prompt и требует JSON
  по схеме;
- `PortfolioExplanationService` заново считает selection на сервере, формирует разрешённые
  факты и проверяет ссылки `fact_ids` в ответе;
- числа в текст модели не передаются. Если в ответе появились цифры, неизвестные факты или
  неверный JSON, ответ отбрасывается и возвращается детерминированный шаблон;
- генерация выполняется одним обычным HTTP-запросом. PostgreSQL, Redis, Taskiq и polling
  для неё не используются. Обычные расчётные ручки от Ollama не зависят.

`POST /portfolio/explain` принимает только `dataset_hash`, полный `selection` из четырёх
пар `lot_id/mode_id` и `scenario`, ждёт Ollama не более 45 секунд и сразу возвращает результат.
Произвольного `prompt` в публичном API нет. При шаблонном fallback поле `generated_by`
равно `template`, а `warning` объясняет причину.

Модель по умолчанию — `qwen3:4b-instruct`: компактная instruct-модель для русского текста
и структурированного JSON. Выбор и источники зафиксированы в
[`docs/research/ollama-model.md`](../docs/research/ollama-model.md). Модель можно заменить
server-side через `COSMOS_OLLAMA_MODEL`; frontend не получает адрес Ollama и её credentials.

Для локального запуска задайте в `.env`:

```dotenv
COSMOS_OLLAMA_BASE_URL=http://localhost:11434
COSMOS_OLLAMA_MODEL=qwen3:4b-instruct
COSMOS_OLLAMA_TIMEOUT_SECONDS=45
```

Для защищённого ngrok-туннеля также задайте:

```dotenv
COSMOS_OLLAMA_USERNAME=cosmos
COSMOS_OLLAMA_PASSWORD=replace-with-an-ngrok-password
```

Если обе переменные заданы, `OllamaClient` отправляет Basic Auth. При локальной
Ollama оставьте их пустыми.

Пример подготовки Ollama без Docker:

```bash
ollama pull qwen3:4b-instruct
```

После запуска API отправьте полный selection в `POST /portfolio/explain`. Ответ с calculation,
facts и explanation придёт в этом же запросе; отдельный worker запускать не нужно.
