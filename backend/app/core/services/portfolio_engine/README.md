# Портфельное ядро

Единственная реализация бывшего корневого `engine/`: канонический адаптер, диагностика,
перебор, Парето, аналитический запас, CLI и self-check. Родительский services не импортирует
авторизацию при загрузке, поэтому чистое ядро работает без веб-зависимостей.

Из `backend/`:

```bash
.venv/bin/python -m app.core.services.portfolio_engine selfcheck
.venv/bin/python -m app.core.services.portfolio_engine evaluate
```

Из корня сохранён `python -m engine ...`. Команды и формулы —
[engine/README.md](../../../../../engine/README.md); API — [backend/README.md](../../../../README.md).

Данные берутся из `case/source` либо `COSMOS_CASE_SOURCE_DIR`. Смена данных требует
перезапуска процесса. Наружу выдаются копии кешированных структур. Selection сортируется
до суммирования, метрики не округляются перед сравнением. Официальный `case_core.py` неизменён.
