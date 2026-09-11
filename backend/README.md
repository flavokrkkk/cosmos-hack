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
- `POST /portfolio/compare` — сравнение 2–4 полных портфелей.

## Портфельный расчёт

Чистое ядро перенесено в `app/core/services/portfolio_engine/`; не импортирует FastAPI,
БД или Ollama. `PortfolioService` формирует каталог/расчёт/сравнение, `RecommendationService`
выбирает рекомендацию; DTO — в `core/dto/portfolio.py`. Корневой `engine/` содержит только
переходники для прежних импортов и CLI, не вторую реализацию.

Портфельные маршруты используют штатную авторизацию, включая её 403 при отсутствии доступа.
Браузер через nginx вызывает `/api/portfolio/*`, FastAPI обслуживает `/portfolio/*`.

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

Полный перебор прогревается в lifespan вне event loop. HTTP-расчёты идут в thread pool через
синхронные обработчики FastAPI, без очереди. Кеши не отдают общие изменяемые объекты наружу.
Путь к исходникам — корневой `case/source` либо переменная окружения `COSMOS_CASE_SOURCE_DIR`,
заданная до старта процесса. Набор фиксирован до перезапуска. Официальные файлы не менялись.

Dockerfile собирается из корня repo, копирует только необходимые runtime-файлы без jury.
В compose снята зависимость app/worker от завершения `ollama-pull`; AI-сервисы сохранены.
Сборка/запуск контейнеров не проверены: локальный Docker daemon недоступен.

Пока не реализованы сохранение решений в PostgreSQL, веб-экспорт/импорт, выдача финальных
материалов, четыре расширения и предметные AI-пояснения. CLI-экспорт сохранён.

### Проверки

Из `backend/`:

```bash
uv pip install --python .venv/bin/python -r requirements-dev.txt
.venv/bin/python -m pytest ../tests tests -q
.venv/bin/python -m app.core.services.portfolio_engine selfcheck
PYTHONPYCACHEPREFIX=/tmp/cosmos-hack-pycache .venv/bin/python -m compileall -q app migrations
.venv/bin/python -c "from app.main import app; print(sorted(app.openapi()['paths']))"
```

Проверено на Python 3.12.14 и pandas 2.3.3: 41 тест, self-check и CLI evaluate/compare.
API-тесты используют реальные роуты с подменой пользователя, без PostgreSQL. Полный запуск
с БД из них не следует. TestClient выдаёт предупреждения о deprecated httpx/anyio-интерфейсах.

Контрольный локальный замер Python 3.12.14: холодный recommend STRESS — 3,909 с,
повторный — 0,0006 с (внутри сервиса, без HTTP/БД). Это один замер, не SLA;
поэтому полный перебор прогревается при старте, а не выполняется на event loop запроса.

Дополнительные зависимости расчёта/тестов: pandas 2.3.3 — BSD-3-Clause, pytest 8.4.2 — MIT,
httpx 0.28.1 — BSD-3-Clause. Установленный NumPy 2.5.3 декларирует
`BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0` для комплекта; см. его LICENSE/NOTICE.
Официальные данные и код получены от кейсодержателя, источник — `case/source/README.md`.
Новый датасет или модель в этой реализации не добавлялись.

## Локальный запуск

```bash
cp .env.example .env
uv venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/uvicorn app.main:app --reload
```

Администратор из `COSMOS_BOOTSTRAP_ADMIN_*` создаётся при первом запуске. Для
production замените JWT-ключ и пароль, затем удалите bootstrap-переменные.

Конфигурация разделена по подсистемам: `AppSettings`, `DatabaseSettings`,
`JWTSettings`, `BootstrapSettings`, `RedisSettings` и `OllamaSettings`. Имена
переменных окружения `COSMOS_*` сохранены.

## Ollama

Backend содержит два отдельных слоя:

- `OllamaClient` в `app/core/clients` отвечает за асинхронный HTTP-вызов
  `/api/chat`, таймаут и преобразование ошибок;
- `OllamaService` в `app/core/services` собирает сообщения и предоставляет
  прикладные методы `chat()` и `answer()`.

Экземпляр сервиса создаётся в lifespan приложения и доступен будущим ручкам
через зависимость `get_ollama_service`. Отдельной публичной LLM-ручки пока нет:
её контракт должен зависеть от выбранного кейса.

Для локального запуска задайте в `.env`:

```dotenv
COSMOS_OLLAMA_BASE_URL=http://localhost:11434
COSMOS_OLLAMA_MODEL=qwen3:4b
COSMOS_OLLAMA_TIMEOUT_SECONDS=180
```

Для защищённого ngrok-туннеля также задайте:

```dotenv
COSMOS_OLLAMA_USERNAME=cosmos
COSMOS_OLLAMA_PASSWORD=replace-with-an-ngrok-password
```

Если обе переменные заданы, `OllamaClient` отправляет Basic Auth. При локальной
Ollama оставьте их пустыми.
