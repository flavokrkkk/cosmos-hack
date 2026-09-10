# Код, подготовленный до хакатона

До старта подготовлены:

- инфраструктурный каркас репозитория;
- React + TypeScript + Vite frontend;
- структура frontend в стиле Feature-Sliced Design;
- FastAPI backend с авторизацией;
- PostgreSQL, Redis, Taskiq worker и Ollama с автоматической загрузкой модели в
  Docker Compose;
- асинхронные `OllamaClient` и `OllamaService` без предметной API-ручки;
- серверный Docker Compose для защищённого доступа к Ollama на Mac через ngrok;
- тренировочное ML-ядро и reference-данные ростовского кейса в `ml/`.

Предметные маршруты, интерфейс, pipeline и адаптация алгоритмов под выданный кейс
должны фиксироваться отдельными коммитами после старта.
