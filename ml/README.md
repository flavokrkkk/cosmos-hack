# ml/ — ML-компонент решения

Leak-free, config-driven ядро под ДЗЗ-кейс с метрикой
(`GapScore = round(30 * max(0, 1 - RMSE / 0.10), 2)`). Собрано и проверено на
реальных данных Ростова заранее. Спроектировано как **generic-ядро под любую
ДЗЗ-задачу** вида «восстановить скрытые значения ряда → RMSE» — детали в
[GENERIC.md](GENERIC.md).

## Структура

```
ml/
  dzz/                 # importable-пакет (generic-ядро)
    config.py          # CaseConfig + VEGETATION (пример) + TEMPLATE  ← правишь под кейс
    data.py            # prepare(): канонизация колонок (target, sensor, doy…)
    metrics.py         # rmse, gap_score, validate_submission
    masking.py         # make_synthetic_gaps — честная маска
    features.py        # соседи, окно, календарь, эффект даты, вероятность источника
    reconstruct.py     # baseline, anchor, model, ensemble
    anomalies.py       # seasonal_z, detect_anomalies (Задача 2)
  local_eval.py        # CLI: честная локальная оценка GapScore
  make_submission.py   # CLI: <test>.csv → submission.csv
  detect_anomalies.py  # CLI: демо аномалий
  selfcheck.py         # батарея проверок: leak-free, детерминизм, генерализуемость, формат
  sample_data/         # публичные данные Ростова для тренировки
```

## Проверка качества

```bash
python ml/selfcheck.py    # 18 проверок, ~8 сек; ненулевой код при падении
```

Проверяет: формулу метрики; честную маску; **детерминированность**; **leak-free**
(порча значений контрольной строки не меняет предсказание); строгий валидатор
(принимает валидное, отклоняет NaN и несовпадение ключей); **генерализуемость**
(тот же пайплайн на ДРУГОЙ схеме — другие имена колонок, без сенсоров, без crop —
даёт валидный submission); разметку аномалий. Это же — доказательство качества для
жюри: решение проверяемо.

Каждый модуль — одна ответственность; CLI — тонкие обёртки над `import dzz`.

## Запуск (из корня репозитория)

```bash
python3 -m pip install pandas numpy scikit-learn

# честная оценка: baseline + anchor + модель + ансамбль
python ml/local_eval.py --data ml/sample_data/train_dataset.csv --model --ensemble

# аномалии (Задача 2)
python ml/detect_anomalies.py --data ml/sample_data/train_dataset.csv

# валидный submission
python ml/make_submission.py \
    --context ml/sample_data/train_dataset.csv \
    --test ml/sample_data/test.csv \
    --out submission.csv --ensemble
```

Или как библиотека:

```python
import sys; sys.path.insert(0, "ml")   # либо запуск из ml/
import dzz, pandas as pd
df = dzz.prepare(pd.read_csv("ml/sample_data/train_dataset.csv"))
```

## Проверенные числа (честная маска, только полигоны train)

| метод | RMSE | GapScore |
|---|---|---|
| baseline организаторов | 0.0936 | 1.91 |
| anchor (смещение источника + сглаживание + эффект даты) | 0.0754 | 7.40 |
| leak-free модель (HGB на остаток) | 0.0704 | 8.89 |
| **модель, ансамбль 3 seed** | **0.0691** | **9.27** |

Ориентир победного решения Ростова (контекст трёх файлов + 73 признака) —
RMSE ~0.063 / GapScore ~11; остаток закрывается контекстом всех файлов и
признаками сеток пролётов.

## Под кейс НН правишь один файл

`dzz/config.py`: заполняешь `CaseConfig` (имена колонок, правило источника,
метрика). `data.prepare()` канонизирует, весь остальной пакет работает без правок.
См. [GENERIC.md](GENERIC.md) — что переносится, а что адаптируется.
