# engine — совместимость CLI и прежних импортов

Реализация перенесена в
[`backend/app/core/services/portfolio_engine`](../backend/app/core/services/portfolio_engine/).
В корневом `engine/` только переходники: `python -m engine` и прежние импорты продолжают работать.
Формулы не продублированы; чистое ядро не зависит от FastAPI, БД или Ollama.

**Принцип:** материалы кейса в [`case/source/`](../case/source) **не изменяются**. `engine`
их только импортирует и читает. Все формулы берутся из `case_core.py` организаторов, поэтому
наши числа совпадают с проверкой жюри (Т1), а исходные условия заведомо не подменены (Т2).

## Запуск

После переноса проверено на **Python 3.12.14** и **pandas 2.3.3** (macOS).

```bash
python -m pip install -r requirements.txt
python -m engine recommend         # гибрид: Q, Δ, шкалы и точки смены
python -m engine evaluate          # рекомендуемый портфель, BASE и STRESS
python -m pytest tests/ -q         # 23 проверки формул, границ и фронта
python -m engine selfcheck        # воспроизводимость и контроль пространства
```

## Команды

| Команда | Что делает |
|---|---|
| `evaluate` | расчёт портфеля + таблица `условие → порог → факт → запас → PASS/FAIL` |
| `compare` | сравнение рекомендации и альтернатив из конфига по единым показателям |
| `space` | полный перебор: допустимость по сценариям, какие ограничения реально связывают |
| `pareto` | недоминируемые конфигурации выбранного сценария |
| `sensitivity` | запас по входным данным: насколько можно ошибиться, пока портфель допустим |
| `export` | контрольные результаты в `results/` |

Портфель меняется **без правки кода** — флагом или конфигом:

```bash
python -m engine evaluate --portfolio FIRE:A,AGRI:A,TRANS:B,ENV:A --scenario STRESS
python -m engine pareto --scenario STRESS --top 20
python -m engine sensitivity --scenario STRESS
```

Постоянные параметры алгоритма (Δ, требования, альтернативы, управленческие поля, допущения) —
в [`config/decision.json`](../config/decision.json).

## Что считается

Формулы одного лота (канонические, из `case_core.apply_mode`):

```text
c0   = c0_source   * k_c0
opex = opex_source * k_opex
vpub = vpub_source * k_vpub
cash = anchor_cash_source * k_anchor + commercial_cash_source * k_commercial
```

Портфель — суммы по `c0`, `opex`, `vpub`, `cash`; средние по `t_rep`, `readiness`,
`resilience`, `scale`; счётчики архетипов, capability groups и лотов с `public_core`.
`kcash = cash / opex`.

Ограничения (общие + лимит `c0` по сценарию: BASE 1300, STRESS 1180) проверяются с тем же
допуском `1e-9`, что в каноническом коде; **граница включается** — `c0 = 1180` проходит STRESS.

## Структура

```text
backend/app/core/services/portfolio_engine/
├── canonical.py    импорт case_core организаторов, загрузка данных кейса
├── constraints.py  диагностика: порог, факт, запас, PASS/FAIL + сверка с каноном
├── space.py        перебор 5670 конфигураций, допустимость, Парето, частоты
├── decision.py     конфиг решения команды (config/decision.json)
└── cli.py          командный интерфейс
```

## Интеграция с backend (для команды бэкенда)

`PortfolioService` и `RecommendationService` импортируют `app.core.services.portfolio_engine`.
API не использует корневые переходники. Контракт HTTP — в [backend/README.md](../backend/README.md).

Контракт, на который можно опираться:

```python
from engine import (
    evaluate,            # (selection) -> (detail_df, metrics_dict)
    diagnose,            # (metrics, scenario) -> list[ConstraintRow]
    all_passed, failed,  # helpers по списку ConstraintRow
    enumerate_space,     # () -> DataFrame на 5670 строк (кешируется)
    feasible,            # (scenario) -> DataFrame допустимых
    pareto_front,        # (DataFrame) -> DataFrame недоминируемых
    binding_analysis,    # () -> DataFrame «какие ограничения связывают»
    input_headroom,      # (selection, scenario) -> list[Headroom]: запас по входам
    binding_first,       # (selection, scenario) -> Headroom: самое узкое место
    c0_breaking_point,   # (selection) -> dict: при каком лимите c0 портфель ломается
    load_decision,       # () -> Decision из config/decision.json
    lot_ids, mode_ids, scenarios,
)

selection = [("FIRE", "A"), ("AGRI", "A"), ("TRANS", "B"), ("ENV", "A")]
detail, metrics = evaluate(selection)
rows = diagnose(metrics, "STRESS")          # у каждой строки: code, title, operator,
                                            # threshold, actual, slack, passed
```

`ConstraintRow.as_dict()` уже готов к отдаче в JSON.

Исторический проект ручек ниже **не реализован под этими адресами**. Сейчас доступны
`GET /portfolio/catalog`, `POST /portfolio/evaluate`, `POST /portfolio/recommend`,
`POST /portfolio/compare`. CLI `evaluate` читает пример из config или `--portfolio`;
автоматического победителя выбирает API recommend.

Прежний проект (для истории):

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/v1/portfolio/lots` | лоты и режимы доступа (исходные данные видны эксперту) |
| `POST` | `/api/v1/portfolio/evaluate` | `{selection, scenario}` → метрики + диагностика ограничений |
| `GET` | `/api/v1/portfolio/feasible` | допустимое множество по сценарию |
| `GET` | `/api/v1/portfolio/pareto` | недоминируемые конфигурации |
| `POST` | `/api/v1/portfolio/compare` | сравнение нескольких вариантов по единым показателям |
| `GET` | `/api/v1/portfolio/space-summary` | сводка перебора и связывающие ограничения |

Расчёт лёгкий и синхронный: полный перебор занимает секунды и кешируется в памяти
(`enumerate_space` под `lru_cache`). Очередь, воркер и отдельный сервис не нужны.

### Чего делать нельзя

- **Менять файлы в `case/source/`.** Любые свои параметры — в `config/`, с пометкой assumption.
- **Складывать `vpub` и `cash`.** Это разные контуры: общественная ценность и деньги.
  «Общий эффект = cash + vpub» — двойной счёт, прямо названный ошибкой в инструкции кейса.
- **Называть `kcash` прибылью, NPV, ROI или сроком окупаемости.** Это только `cash / opex`.
- **Показывать голый boolean** вместо таблицы с порогом и фактическим значением — инструкция
  называет это худшим вариантом для Т3.
- **Снижать исходные `c0` лотов, чтобы «пройти» STRESS.** Сначала честный пересчёт, затем
  управленческое решение.

## Контрольные результаты

`python -m engine export` пишет в [`results/`](../results):
`portfolio_detail.csv`, `portfolio_metrics.json`, `team_decision_config.json`,
`constraints_BASE.csv`, `constraints_STRESS.csv`, `sensitivity_BASE.csv`, `sensitivity_STRESS.csv`,
`portfolio_space.csv` (полный перебор).

Эти файлы — источник чисел для записки и презентации. Требование рубрики: цифры в записке,
на слайдах и в выводе инструмента **обязаны совпадать**.


## Единственный выбор: hybrid_maximin_v1

Реализация — `backend/app/core/services/portfolio_engine/hybrid.py`, одинаковая для API и CLI. `config/decision.json` содержит входы, а не назначенного победителя. `load_decision()` вычисляет рекомендацию по ним. `recommend --delta 5` переопределяет Δ до поиска; `--base-only` меняет область поиска. Для проверки того же портфеля в другом сценарии используйте `evaluate --scenario BASE|STRESS`.

`cash_loss_limit_mrub: null` означает автоматический Δ* = Smax − max S при глобальном максимуме Q. Числовой Δ ограничивает уступку денег независимо от Q. ε=0 фиксирован. Нормирование по всей официально допустимой области выбранного сценария фиксируется до дополнительных фильтров, состава и шоков. Готовность, устойчивость и scale используют достигнутые диапазоны, не исходную шкалу 1–5. Постоянный критерий = 1. Ранжирование: Q, S, сумма шести нормированных оценок, стабильный ID. Расчёт Q точный через Fraction после округления агрегатов до 8 знаков; исходные метрики экспорта не округляются.

`export` сохраняет `hybrid_analysis.json` (входной Δ, фактический Δ, Smax, порог, Q, шкалы, переключения и чувствительность) и канонические BASE/STRESS результаты. Допущения и предметное обоснование: [docs/22-hybrid-selection.md](../docs/22-hybrid-selection.md). Автономная копия собирается `python scripts/build_submission.py`; копии в `team-submission/src` вручную не редактируются.
