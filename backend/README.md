# Backend

FastAPI-каркас повторяет слои `flowers_store`: `api`, `core`, `infrastructure`,
`utils`, `scripts` и `migrations`. Магазинные сущности и внешние интеграции не
переносились.

## API

- `POST /admin/auth/login`;
- `POST /admin/auth/refresh`;
- `GET /admin/auth/current_user`;
- `GET /health` — технический healthcheck.

## Локальный запуск

```bash
cp .env.example .env
uv venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/uvicorn app.main:app --reload
```

Администратор из `COSMOS_BOOTSTRAP_ADMIN_*` создаётся при первом запуске. Для
production замените JWT-ключ и пароль, затем удалите bootstrap-переменные.

## Ollama

Backend содержит два отдельных слоя:

- `OllamaClient` в `app/core/clients` отвечает за HTTP-вызовы `/api/chat` и
  `/api/tags`, таймауты и преобразование ошибок;
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
