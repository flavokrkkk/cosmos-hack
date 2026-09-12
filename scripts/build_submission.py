"""Собрать автономный комплект по п. 13, не создавая вторую реализацию алгоритма.

Из корня: python scripts/build_submission.py [--output /path/to/team-submission]
Копирует только явный список файлов; существующие PDF материалов защиты сохраняет.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'team-submission')
    args = parser.parse_args()
    target = args.output.resolve()
    if target == ROOT or ROOT in target.parents and target != ROOT / 'team-submission':
        parser.error('Внутри проекта используйте только team-submission; другой выход — вне проекта.')
    target.mkdir(parents=True, exist_ok=True)
    # Один свежий экспорт по текущим входам; не запускаем старые исследовательские эксперименты.
    subprocess.run([sys.executable, '-m', 'engine', 'export'], cwd=ROOT, check=True)
    previous = json.loads((target / 'manifest.json').read_text()) if (target / 'manifest.json').exists() else {}
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
    for path in sorted((ROOT / 'results').glob('*')):
        if path.is_file():
            copy(str(path.relative_to(ROOT)), f'results/{path.name}')
    for name in ('test_engine.py', 'test_hybrid.py', 'test_cli_config.py'):
        copy(f'tests/{name}', f'tests/{name}')
    copy('scripts/submission_readme.md', 'README.md')
    copy('docs/22-hybrid-selection.md', 'docs/algorithm.md')
    copy('docs/23-results-glossary.md', 'docs/23-results-glossary.md')
    # Актуальные материалы защиты; исторические записки 10/11 в комплект не попадают.
    copy('docs/23-management-note.md', 'docs/management-note.md')
    copy('docs/24-stress-summary.md', 'docs/stress-summary.md')
    # Только то, на что опираются актуальные документы. Материалы с прежним портфелем остаются
    # в основном репозитории: в комплекте не должно быть чисел, помеченных как неактуальные.
    for name in ('access-mode-d.md', 'case-literature.md', 'portfolio-audit-results.json'):
        copy(f'docs/research/{name}', f'docs/research/{name}')

    (target / 'run.py').write_text('import sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).resolve().parent / "src"))\nfrom engine.cli import main\nif __name__ == "__main__":\n    raise SystemExit(main())\n', encoding='utf-8')
    (target / 'tests/conftest.py').write_text('import sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))\n', encoding='utf-8')
    (target / 'requirements.txt').write_text('numpy==2.5.3\npandas==2.3.3\npytest==8.4.2\n', encoding='utf-8')
    (target / '.gitignore').write_text('.venv/\n__pycache__/\n.pytest_cache/\n*.pyc\n', encoding='utf-8')
    (target / 'docs/README.md').write_text('''# Материалы для эксперта

`management-note.md` — управленческая записка по принятому портфелю: разделы соответствуют продуктовым критериям П1–П9, приложения содержат реестр рисков, матрицу ответственности с KPI и пролотовый расчёт. `stress-summary.md` — обязательное резюме стресс-сценария. `algorithm.md` — как портфель вычислен: правило выбора, контрольный результат и границы выводов.

`research/` — исследовательский контекст: литература кейса и проверяемая гипотеза собственного режима D. Материалы с прежним портфелем в комплект не переносятся, поэтому все рекомендации здесь описывают один и тот же вычисленный выбор, и `../tests/` это проверяют. Пометка «контекст основного репозитория» даёт путь от корня репозитория команды, внутри которого лежит этот комплект.

По пункту 13 итоговой сдаче нужны те же два документа в PDF (`docs/management-note.pdf` — 8–12 страниц, `docs/stress-summary.pdf` — 1 страница) и `presentation.pdf` (до 12 слайдов). Сборщик переносит PDF, если они собраны в основном репозитории, и честно отражает их отсутствие в `manifest.json`: вёрстка не подменяет содержание, источником остаются markdown-файлы рядом. Notebook не используется.

Контроль BASE/STRESS — в `../results/constraints_BASE.csv` и `../results/constraints_STRESS.csv`. Оба файла проверяют один и тот же выбранный портфель. Актуальные числа — `../results/portfolio_metrics.json`, метод — `../results/hybrid_analysis.json`.
''', encoding='utf-8')
    (target / 'docs/research/README.md').write_text("# Исследовательский контекст\n\n[Литература кейса](case-literature.md), [гипотеза D](access-mode-d.md) и выгрузка её расчёта. Это не рекомендации: коэффициенты D не переведены в производственные входы. Текущая рекомендация и её ограничения — в [algorithm.md](../algorithm.md). Ссылки на файлы основного репозитория, не входящие в автономный расчёт, отмечены как контекст. Первичные DOI и веб-источники сохранены.\n", encoding='utf-8')
    for name in previous.get('source_copies', {}):
        path = (target / name).resolve()
        if name not in copies and path.is_relative_to(target) and path.is_file() and path.suffix != '.pdf':
            path.unlink()
    # Относительные ссылки исходной базы знаний адаптируем к автономному комплекту.
    for path in (target / 'docs').rglob('*.md'):
        origin = Path(copies.get(str(path.relative_to(target)), {}).get('source', '')).parent
        text = path.read_text(encoding='utf-8')
        for name in official:
            text = text.replace(f'case/source/{name}', f'data/official/{name}')
        # Только скопированные файлы переадресуем; остальное в case/source остаётся ссылкой на репозиторий.
        text = re.sub(r'case/source/(?!\w)', 'data/official/', text)
        text = re.sub(r'case/source(?!/)', 'data/official', text)
        text = text.replace('../team-submission/README.md', '../README.md')
        text = text.replace('22-hybrid-selection.md', 'algorithm.md')
        text = text.replace('23-management-note.md', 'management-note.md')
        text = text.replace('24-stress-summary.md', 'stress-summary.md')
        # Остальной исследовательский контекст доступен по первичным URL внутри документов.
        def local_link(match):
            label, url = match.groups()
            local = url.split('#', 1)[0]
            if local and not local.startswith(('https://', 'http://', 'mailto:')) and not (path.parent / local).exists():
                # Путь от корня основного репозитория: комплект лежит внутри него, ссылка проверяема.
                repo_path = os.path.normpath(origin / local)
                # Если метка уже называет путь, приводим её к корню репозитория вместо повтора пути.
                label = label.replace(local, repo_path)
                if repo_path in label:
                    return f"{label} (контекст основного репозитория)"
                return f"{label} (контекст основного репозитория: `{repo_path}`)"
            return match.group(0)
        text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', local_link, text)
        path.write_text(text, encoding='utf-8')
    missing = []
    for name in ('docs/management-note.pdf', 'docs/stress-summary.pdf', 'presentation.pdf'):
        if (ROOT / name).exists():
            copy(name, name)
        if not (target / name).exists():
            missing.append(name)
    manifest = dict(format_version=1, method='hybrid_maximin_v1',
                    status='calculation_ready_materials_pending' if missing else 'materials_present',
                    missing_materials=missing, source_copies=copies,
                    files={str(path.relative_to(target)): sha(path) for path in sorted(target.rglob('*'))
                           if path.is_file() and path.name != 'manifest.json'
                           and not any(part in ('.venv','__pycache__','.pytest_cache') for part in path.relative_to(target).parts)})
    (target / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Комплект: {target}; файлов: {len(manifest["files"])}; материалы ожидаются: {missing}')


if __name__ == '__main__':
    main()
