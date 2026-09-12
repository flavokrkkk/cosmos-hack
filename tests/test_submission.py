"""Комплект содержит то же ядро и те же входы; отсутствие PDF не скрывается."""
import hashlib
import json
import re
from pathlib import Path

import pytest

from backend.app.core.services.portfolio_engine import load_decision

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / 'team-submission'


def test_submission_sources_match_single_implementation():
    for path in (ROOT/'backend/app/core/services/portfolio_engine').glob('*.py'):
        assert (BUNDLE/'src/engine'/path.name).read_bytes() == path.read_bytes(), path.name
    assert (BUNDLE/'config/decision.json').read_bytes() == (ROOT/'config/decision.json').read_bytes()
    for name in ('case_core.py','data/lots.csv','data/access_modes.csv','config/case_config.json'):
        assert (BUNDLE/'data/official'/name).read_bytes() == (ROOT/'case/source'/name).read_bytes()


def test_submission_manifest_and_material_status():
    manifest = json.loads((BUNDLE/'manifest.json').read_text())
    for name, digest in manifest['files'].items():
        assert hashlib.sha256((BUNDLE/name).read_bytes()).hexdigest() == digest, name
    required = ('docs/management-note.pdf','docs/management-note-appendices.pdf','docs/stress-summary.pdf','presentation.pdf')
    assert manifest['missing_materials'] == [name for name in required if not (BUNDLE/name).is_file()]
    assert all(not any(part in name.split('/') for part in ('.env','.venv','node_modules','flowers_store')) for name in manifest['files'])


def test_bundled_defence_documents_describe_the_computed_portfolio():
    """Результат комплекта совпадает с движком; рабочие тексты проверяются, если сохранены."""
    computed = {f'{lot}:{mode}' for lot, mode in load_decision().recommended.selection}
    saved = json.loads((BUNDLE/'results/team_decision_config.json').read_text())
    assert {f'{lot}:{mode}' for lot, mode in saved['recommended']['selection']} == computed
    if not (ROOT/'docs').exists():
        # Финальный снимок содержит PDF; отсутствие рабочих исходников не отменяет проверку JSON.
        return
    for name in ('docs/23-management-note.md', 'docs/24-stress-summary.md'):
        text = (ROOT/name).read_text()
        # Машинная запись состава в документе: порядок изложения наш, множество — движка.
        written = re.findall(r'`([A-Z]+:[ABC](?:, [A-Z]+:[ABC])*)`', text)
        assert written, name
        assert all(set(line.split(', ')) == computed for line in written), (name, written)
        assert 'Историческая версия' not in text, name
        other = {line for line in re.findall(r'`([A-Z]+:[ABCD](?:, [A-Z]+:[ABCD])*)`', text)
                 if set(line.split(', ')) != computed}
        assert not other, (name, other)


def test_bundled_relative_links_resolve():
    # Каноничные материалы организаторов в data/official не правим, их ссылки не наши.
    for path in [BUNDLE/'README.md']:
        for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
            local = target.split('#', 1)[0]
            if local and not local.startswith(('http://', 'https://', 'mailto:')):
                assert (path.parent/local).exists(), f'{path.name} → {target}'


def test_bundle_keeps_final_documents_and_explains_result_fields_in_readme():
    manifest = json.loads((BUNDLE/'manifest.json').read_text())
    assert {str(path.relative_to(BUNDLE)) for path in (BUNDLE/'docs').rglob('*') if path.is_file()} == {
        'docs/management-note.pdf', 'docs/management-note-appendices.pdf', 'docs/stress-summary.pdf',
    }
    for name in (
        'docs/management-note.md', 'docs/stress-summary.md',
        'docs/algorithm.md', 'docs/notes/consultations.md',
        'docs/research/case-literature.md', 'docs/README.md',
        'docs/research/README.md', 'docs/23-results-glossary.md',
    ):
        assert not (BUNDLE/name).exists(), name
        assert name not in manifest['files'], name
        assert name not in manifest['source_copies'], name
    assert manifest['source_copies']['README.md']['source'] == 'scripts/build_submission.py'
    readme = (BUNDLE/'README.md').read_text()
    for field in (
        'hybrid_analysis.json', 'winner', 'checks.BASE', 'checks.STRESS',
        'search_summary', 'alternatives', 'switching_curve', 'headroom',
        'sensitivity', 'export_provenance', 'document_values',
    ):
        assert f'`{field}`' in readme, field


def test_bundle_is_not_stale_against_its_sources():
    """Каждый файл комплекта совпадает с тем, из чего собран.

    Манифест хранит sha256 источника для каждой копии. Если источник изменился, а
    `scripts/build_submission.py` не перезапускали, в сдачу уедет прежняя версия — именно так
    в комплект один раз попал PDF от предыдущего рендера записки.
    """
    manifest = json.loads((BUNDLE/'manifest.json').read_text())
    stale = []
    for copied, origin in manifest['source_copies'].items():
        source = ROOT/origin['source']
        if not source.is_file():
            if not (ROOT/'docs').exists() and origin['source'] in (
                'docs/23-management-note.md', 'docs/24-stress-summary.md',
                'docs/25-presentation-skeleton.md',
            ):
                continue
            stale.append((copied, f"источник {origin['source']} отсутствует"))
        elif hashlib.sha256(source.read_bytes()).hexdigest() != origin['source_sha256']:
            stale.append((copied, f"источник {origin['source']} изменился"))
    assert not stale, ('комплект устарел, запустите python scripts/build_submission.py: '
                       f'{stale}')


def test_committed_pdf_matches_a_fresh_render():
    """PDF в репозитории собран из текущего markdown, и рендер воспроизводим побайтово.

    Пропускается в финальном снимке без рабочей docs или там, где нет Chrome. На машине
    команды проверка обязательна — иначе правка текста уезжает в сдачу со старым PDF.
    """
    import importlib.util
    import sys

    if not (ROOT/'docs').exists():
        pytest.skip('финальный снимок содержит готовые PDF без рабочих исходников docs')

    sys.path.insert(0, str(ROOT / 'scripts'))
    import render_pdf

    if not render_pdf.CHROME.exists() or importlib.util.find_spec('markdown') is None:
        pytest.skip('нет Chrome или markdown — вёрстка PDF недоступна в этой среде')

    scratch = ROOT / 'results/.render-check'
    scratch.mkdir(exist_ok=True)
    try:
        for job in render_pdf.JOBS:
            fresh = scratch / Path(job['target']).name
            render_pdf.render_job(job, fresh)
            assert fresh.read_bytes() == (ROOT / job['target']).read_bytes(), (
                f"{job['target']} не совпадает со свежим рендером {job['source']}: "
                'запустите python scripts/render_pdf.py')
    finally:
        for leftover in scratch.iterdir():
            leftover.unlink()
        scratch.rmdir()
