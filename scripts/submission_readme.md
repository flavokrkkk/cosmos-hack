# ТЧК MISIS — расчётный комплект, Кейс 02

**Для знакомства с решением рекомендуем [сайт команды](https://mogged.chillflex.art/).** На нём уже настроена Ollama: доступны расчёты, сравнение, экспорт и модельные объяснения. Локально скачивать модель не требуется.

Этот комплект — независимый способ воспроизвести расчёт через ноутбук или CLI. Здесь тот же движок, что в приложении. Для запуска полного веб-интерфейса через Docker используйте [основной репозиторий команды](https://github.com/flavokrkkk/cosmos-hack): `docker compose up -d --build --wait`.

## Ноутбук

Нужен Python 3.12. Из каталога комплекта:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r notebooks/requirements.txt
.venv/bin/python -m jupyterlab notebooks/portfolio_review.ipynb
```

В Windows путь к Python: `.venv\Scripts\python.exe`. Выполните **Run All Cells**.
Ноутбук показывает результат команды и позволяет менять поля лотов, коэффициенты A/B/C,
запускать автоподбор или ручную проверку, сравнивать расчёты и проверять BASE/STRESS.
Сервер и Ollama не нужны; файлы сдачи не перезаписываются.

## CLI

Если Jupyter не нужен, установите `requirements.txt` в Python-окружение и выполните:

```bash
.venv/bin/python run.py recommend
.venv/bin/python run.py evaluate --portfolio FIRE:A,AGRI:B,TRANS:B,ENV:A
.venv/bin/python run.py evaluate --snapshot /путь/team_decision_config.json
.venv/bin/python run.py compare
```

`recommend` запускает подбор, `evaluate` проверяет заданный состав в BASE/STRESS,
`--snapshot` воспроизводит входы выгрузки, `compare` сопоставляет альтернативы конфигурации.
Для проверки реализации доступны `run.py selfcheck` и `python -m pytest tests -q`.

## Входы и результаты

Метод `hybrid_maximin_v1`: обязательные ограничения → максимум слабейшей оценки Q → больший
остаток S при равенстве. Числовой Δ дополнительно ограничивает потерю S; `null` означает
автоматический приоритет Q. Обоснование и обозначения — в [algorithm.md](docs/algorithm.md).

Параметры, альтернативы и допущения находятся в `config/decision.json`.
Для изменённых данных предусмотрен полный снимок `algorithm_parameters.inputs`: восемь
лотов и три режима. Свой конфиг передаётся перед командой: `run.py --config /путь/decision.json recommend`.
Команда `run.py export --output /путь/эксперимент` сохраняет отдельный результат.

В [results/](results/) четыре файла:

- `hybrid_analysis.json` — выбранный состав, шесть оценок, проверки, альтернативы и чувствительность;
- `portfolio_metrics.json` — итоговые показатели;
- `portfolio_detail.csv` — расчёт по лотам;
- `team_decision_config.json` — состав, параметры, допущения и происхождение результата.

В UI-выгрузке состав и `inputs` находятся в верхнем уровне; в CLI — в `recommended.selection`
и `algorithm_parameters.inputs`. Команда `evaluate --snapshot` понимает оба формата.
Управленческие поля с `management_status=reference_requires_review` требуют пересмотра для изменённого варианта.

Код движка находится в `src/engine/`, неизменённые материалы организаторов — в `data/official/`.
`manifest.json` содержит контрольные суммы и перечень отсутствующих материалов.
Записка и стресс-резюме — в [docs/](docs/README.md). Интернет нужен для установки зависимостей;
расчёты выполняются локально. Сборщик комплекта запускать не требуется.

## Источники, лицензии и воспроизводимость

**ФАКТ:** источник кейса — [SpaceEconomyPolicy/test](https://github.com/SpaceEconomyPolicy/test), коммит `3fa773b8e416f814634ad3b017a3a2cbcabc3331`. Четыре расчётных файла совпадают побайтово. Их совокупный SHA-256: `1700fdbd1f2d51b7b639304323147dfa592a71d541c9ea723dca32b66fe38f22`. Копия сохранена для проверки кейса; отдельная лицензия на эти материалы не заявляется командой. Авторство канонического расчёта принадлежит организаторам.

**НАХОДКА:** сочетание ограничений на цели и Chebyshev/ASF описано в [MultiOptForest](https://doi.org/10.12688/openreseurope.15812.2) и [DESDEO](https://desdeo.readthedocs.io/en/latest/explanation/scalarization/). Реализация написана командой без копирования чужого оптимизатора. Обоснование выбора шкал и автоматического Δ — допущение команды. Исследованный [репозиторий другой команды](https://github.com/Mihail239239/Clodex_Cosmoton) служил источником сравнения; его код не включён в комплект.

Зависимости: [NumPy](https://numpy.org/doc/stable/license.html) и [pandas](https://pandas.pydata.org/docs/getting_started/overview.html#license) — BSD; [pytest](https://docs.pytest.org/en/stable/license.html) — MIT. Иные внешние модели или данные для вычисления не используются.

Пункт 13 рекомендует данную структуру, а порядок сдачи указывает GitVerse: [инструкция кейса](data/official/README.md#13-что-должно-лежать-в-финальном-репозитории-команды). Комплект подготовлен локально; публикация не выполняется сборщиком.
