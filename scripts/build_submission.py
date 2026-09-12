"""Собрать автономный комплект по п. 13, не создавая вторую реализацию алгоритма.

Из корня: python scripts/build_submission.py [--output /path/to/team-submission]
Копирует только явный список файлов; существующие PDF материалов защиты сохраняет.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.core.services.portfolio_engine.export_integrity import EXPORT_FILES, LEGACY_FILES, verify_export

ENGINE_MODULE = 'backend.app.core.services.portfolio_engine'
LEGACY_DOCUMENTS = (
    'docs/management-note.md',
    'docs/stress-summary.md',
    'docs/algorithm.md',
    'docs/notes/consultations.md',
    'docs/research/case-literature.md',
    'docs/README.md',
    'docs/research/README.md',
)


SUBMISSION_README = r"""# ТЧК MISIS — расчётный комплект, Кейс 02

**Для знакомства с решением рекомендуем [сайт команды](https://mogged.chillflex.art/).** На нём уже настроена Ollama: доступны расчёты, сравнение, экспорт и модельные объяснения. Локально скачивать модель не требуется.

Этот комплект — независимый способ воспроизвести расчёт через ноутбук или CLI. Здесь тот же движок, что в приложении. Для запуска полного веб-интерфейса через Docker используйте [основной репозиторий команды](https://github.com/flavokrkkk/cosmos-hack): `docker compose up -d --build --wait`.

Материалы решения: [управленческая записка](docs/management-note.pdf),
[расчётные приложения и источники](docs/management-note-appendices.pdf),
[одностраничное стресс-резюме](docs/stress-summary.pdf).
Финальную презентацию готовит дизайнер;
сборщик включает `presentation.pdf`, когда файл предоставлен.

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

Метод `hybrid_maximin_v1` сначала исключает нарушения обязательных ограничений.
Затем сравнивает общественную ценность VPUB, годовой остаток S, затраты запуска C0,
готовность, устойчивость и тиражируемость. Каждый показатель переводится в шкалу 0–1
по худшему и лучшему допустимому значению; для C0 меньшее значение лучше.
Границы шкал фиксируются до пользовательских ограничений и Δ.
Q — самая низкая из шести оценок. Выбирается максимум Q, при равенстве — больший S,
затем сумма оценок и фиксированный порядок составов.

`cash_loss_limit_mrub=null` означает этот автоматический приоритет: Δ вычисляется
как разница между максимальным S и остатком выбранного портфеля. Если задан числовой Δ,
до сравнения по Q остаются только варианты с S ≥ Smax − Δ. Допуск качества ε равен 0.

C0 измеряется в млн ₽; OPEX, CASH, VPUB и S — в млн ₽/год.
S = CASH − OPEX — остаток до возврата C0, налогов и стоимости капитала;
KCASH = CASH / OPEX — покрытие расходов. VPUB не складывается с CASH.
`readiness_1_5`, `resilience_1_5`, `scale_1_5` — средние индексы портфеля по шкале 1–5.
Показатель `t_rep` используется только для проверки заданного организаторами порога.

Параметры, альтернативы и допущения находятся в `config/decision.json`.
Для изменённых данных предусмотрен полный снимок `algorithm_parameters.inputs`: восемь
лотов и три режима. Свой конфиг передаётся перед командой: `run.py --config /путь/decision.json recommend`.
Команда `run.py export --output /путь/эксперимент` сохраняет отдельный результат.

В [results/](results/) четыре файла:

- `hybrid_analysis.json` — выбранный состав, шесть оценок, проверки, альтернативы и чувствительность;
- `portfolio_metrics.json` — итоговые показатели;
- `portfolio_detail.csv` — расчёт по лотам;
- `team_decision_config.json` — состав, параметры, допущения и происхождение результата.

В `hybrid_analysis.json` раздел `winner` содержит показатели и шесть оценок;
`checks.BASE` и `checks.STRESS` — порог, факт, запас и PASS/FAIL одного состава.
STRESS снижает лимит запуска и не меняет цены лотов. `search_summary` показывает
число рассмотренных вариантов; `alternatives` — сравнение с альтернативами,
`switching_curve` — смену выбора при разных Δ. `headroom` и `sensitivity` описывают
отдельные изменения условий, не вероятности событий. `null` обозначает отсутствие
или неприменимость значения, а не ноль. `export_provenance` в конфигурации связывает
результаты с версиями входов и движка; `document_values` хранит показатели для сверки текста.

В UI-выгрузке состав и `inputs` находятся в верхнем уровне; в CLI — в `recommended.selection`
и `algorithm_parameters.inputs`. Команда `evaluate --snapshot` понимает оба формата.
Управленческие поля с `management_status=reference_requires_review` требуют пересмотра для изменённого варианта.

Код движка находится в `src/engine/`, неизменённые материалы организаторов — в `data/official/`.
`manifest.json` содержит контрольные суммы и перечень отсутствующих материалов.
Интернет нужен для установки зависимостей; расчёты выполняются локально.
Сборщик комплекта запускать не требуется.

## Источники, лицензии и воспроизводимость

**ФАКТ:** источник кейса — [SpaceEconomyPolicy/test](https://github.com/SpaceEconomyPolicy/test), коммит `3fa773b8e416f814634ad3b017a3a2cbcabc3331`. Четыре расчётных файла совпадают побайтово. Их совокупный SHA-256: `1700fdbd1f2d51b7b639304323147dfa592a71d541c9ea723dca32b66fe38f22`. Копия сохранена для проверки кейса; отдельная лицензия на эти материалы не заявляется командой. Авторство канонического расчёта принадлежит организаторам.

**НАХОДКА:** сочетание ограничений на цели и Chebyshev/ASF описано в [MultiOptForest](https://doi.org/10.12688/openreseurope.15812.2) и [DESDEO](https://desdeo.readthedocs.io/en/latest/explanation/scalarization/). Реализация написана командой без копирования чужого оптимизатора. Обоснование выбора шкал и автоматического Δ — допущение команды. Исследованный [репозиторий другой команды](https://github.com/Mihail239239/Clodex_Cosmoton) служил источником сравнения; его код не включён в комплект.

Зависимости: [NumPy](https://numpy.org/doc/stable/license.html) и [pandas](https://pandas.pydata.org/docs/getting_started/overview.html#license) — BSD; [pytest](https://docs.pytest.org/en/stable/license.html) — MIT. Иные внешние модели или данные для вычисления не используются.

Пункт 13 официальной инструкции рекомендует данную структуру, а порядок сдачи указывает GitVerse.
Комплект подготовлен локально; публикация не выполняется сборщиком.
"""


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'team-submission')
    parser.add_argument('--skip-export', action='store_true',
                        help='использовать готовый export после сверки хешей входов, кода и результатов')
    args = parser.parse_args()
    target = args.output.resolve()
    if target == ROOT or ROOT in target.parents and target != ROOT / 'team-submission':
        parser.error('Внутри проекта используйте только team-submission; другой выход — вне проекта.')
    # В полном пайплайне export уже выполнен до сверки чисел и PDF. Проверяем его
    # происхождение без повторного поиска; самостоятельная сборка по умолчанию экспортирует.
    if not args.skip_export:
        subprocess.run([sys.executable, '-m', ENGINE_MODULE, 'export'], cwd=ROOT, check=True)
    try:
        verify_export(ROOT / 'results', ROOT / 'config/decision.json')
    except ValueError as error:
        parser.error(str(error))
    target.mkdir(parents=True, exist_ok=True)
    copies = {}

    def copy(source, destination):
        src, dst = ROOT / source, target / destination
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        copies[destination] = {'source': source, 'source_sha256': sha(src)}

    for path in sorted((ROOT / 'backend/app/core/services/portfolio_engine').glob('*.py')):
        copy(str(path.relative_to(ROOT)), f'src/engine/{path.name}')
    official = ('case_core.py', 'data/lots.csv', 'data/access_modes.csv', 'config/case_config.json', 'README.md')
    for name in official:
        copy(f'case/source/{name}', f'data/official/{name}')
    copy('config/decision.json', 'config/decision.json')
    copy('notebooks/portfolio_review.ipynb', 'notebooks/portfolio_review.ipynb')
    copy('notebooks/requirements.txt', 'notebooks/requirements.txt')
    for name in EXPORT_FILES:
        copy(f'results/{name}', f'results/{name}')
    for name in LEGACY_FILES:
        (target / 'results' / name).unlink(missing_ok=True)
    for name in ('test_engine.py', 'test_hybrid.py', 'test_cli_config.py'):
        copy(f'tests/{name}', f'tests/{name}')
        copied_test = target / 'tests' / name
        copied_test.write_text(copied_test.read_text(encoding='utf-8').replace(ENGINE_MODULE, 'engine'),
                               encoding='utf-8')
    (target / 'README.md').write_text(SUBMISSION_README, encoding='utf-8')
    copies['README.md'] = {'source': 'scripts/build_submission.py', 'source_sha256': sha(Path(__file__))}
    (target / 'run.py').write_text('import sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).resolve().parent / "src"))\nfrom engine.cli import main\nif __name__ == "__main__":\n    raise SystemExit(main())\n', encoding='utf-8')
    (target / 'tests/conftest.py').write_text('import sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))\n', encoding='utf-8')
    (target / 'requirements.txt').write_text('numpy==2.5.3\npandas==2.3.3\npytest==8.4.2\n', encoding='utf-8')
    (target / '.gitignore').write_text('.venv/\n__pycache__/\n.pytest_cache/\n.ipynb_checkpoints/\n*.pyc\n', encoding='utf-8')
    # Удаляем только известные материалы прежних сборок. Остальные файлы,
    # включая дизайнерские PDF, не принадлежат этой очистке.
    for name in LEGACY_DOCUMENTS:
        path = target / name
        if path.is_file() or path.is_symlink():
            path.unlink()
    for name in ('docs/notes', 'docs/research'):
        path = target / name
        if path.is_dir() and not any(path.iterdir()):
            path.rmdir()
    missing = []
    for name in ('docs/management-note.pdf', 'docs/management-note-appendices.pdf', 'docs/stress-summary.pdf', 'presentation.pdf'):
        if (ROOT / name).exists():
            copy(name, name)
        if not (target / name).exists():
            missing.append(name)
    manifest = dict(format_version=1, method='hybrid_maximin_v1',
                    status='calculation_ready_materials_pending' if missing else 'materials_present',
                    missing_materials=missing, source_copies=copies,
                    files={str(path.relative_to(target)): sha(path) for path in sorted(target.rglob('*'))
                           if path.is_file() and path.name != 'manifest.json'
                           and not any(part in ('.venv','__pycache__','.pytest_cache','.ipynb_checkpoints') for part in path.relative_to(target).parts)})
    (target / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Комплект: {target}; файлов: {len(manifest["files"])}; материалы ожидаются: {missing}')


if __name__ == '__main__':
    main()
