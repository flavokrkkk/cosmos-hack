# Портфельное ядро

Единственная реализация бывшего корневого `engine/`: канонический адаптер, диагностика,
перебор, Парето, аналитический запас, CLI и self-check. Родительский services не импортирует
авторизацию при загрузке, поэтому чистое ядро работает без веб-зависимостей.

Из `backend/`:

```bash
.venv/bin/python -m app.core.services.portfolio_engine selfcheck
.venv/bin/python -m app.core.services.portfolio_engine evaluate
```

Из корня:

```bash
backend/.venv/bin/python -m backend.app.core.services.portfolio_engine selfcheck
backend/.venv/bin/python -m backend.app.core.services.portfolio_engine recommend
backend/.venv/bin/python -m backend.app.core.services.portfolio_engine evaluate --scenario STRESS
```

`evaluate --portfolio FIRE:A,AGRI:A,TRANS:A,ENV:A` проверяет заданный состав;
`recommend` подбирает портфель, `compare` сравнивает варианты конфигурации,
`space` перечисляет пространство, `sensitivity` показывает запас до порогов,
`export` сохраняет контрольные результаты. Настройки CLI —
[config/decision.json](../../../../../config/decision.json), API — [backend/README.md](../../../../README.md).
Автономный комплект запускает копию этого ядра через `python run.py`.

Данные берутся из `case/source` либо `COSMOS_CASE_SOURCE_DIR`. Смена данных требует
перезапуска процесса. Наружу выдаются копии кешированных структур. Selection сортируется
до суммирования, метрики не округляются перед канонической проверкой ограничений. Официальный `case_core.py` неизменён.

Единственный алгоритм выбора находится в `hybrid.py`. Старые профили удалены. Официальные показатели остаются без округления; для ранжирования используется точное рациональное нормирование после округления агрегатов до 8 знаков. Метод, точность и контрольный результат — [принятый алгоритм](../../../../../docs/22-hybrid-selection.md).
