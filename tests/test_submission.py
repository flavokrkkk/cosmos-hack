"""Комплект содержит то же ядро и те же входы; отсутствие PDF не скрывается."""
import hashlib
import json
import re
from pathlib import Path

from engine import load_decision

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
    required = ('docs/management-note.pdf','docs/stress-summary.pdf','presentation.pdf')
    assert manifest['missing_materials'] == [name for name in required if not (BUNDLE/name).is_file()]
    assert all(not any(part in name.split('/') for part in ('.env','.venv','node_modules','flowers_store')) for name in manifest['files'])


def test_bundled_defence_documents_describe_the_computed_portfolio():
    """Записка и резюме стресса в комплекте — актуальные; исторические черновики не уезжают."""
    computed = {f'{lot}:{mode}' for lot, mode in load_decision().recommended.selection}
    for name in ('docs/management-note.md', 'docs/stress-summary.md'):
        # Машинная запись состава в документе: порядок изложения наш, множество — движка.
        written = re.findall(r'`([A-Z]+:[ABC](?:, [A-Z]+:[ABC])*)`', (BUNDLE/name).read_text())
        assert written, name
        assert all(set(line.split(', ')) == computed for line in written), (name, written)
    # Ни один документ защиты в комплекте не помечен как устаревший и не называет другой состав.
    for path in (BUNDLE/'docs').glob('*.md'):
        text = path.read_text()
        assert 'Историческая версия' not in text, path.name
        other = {line for line in re.findall(r'`([A-Z]+:[ABCD](?:, [A-Z]+:[ABCD])*)`', text)
                 if set(line.split(', ')) != computed}
        assert not other, (path.name, other)


def test_bundled_relative_links_resolve():
    # Каноничные материалы организаторов в data/official не правим, их ссылки не наши.
    for path in (BUNDLE/'docs').rglob('*.md'):
        for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
            local = target.split('#', 1)[0]
            if local and not local.startswith(('http://', 'https://', 'mailto:')):
                assert (path.parent/local).exists(), f'{path.name} → {target}'


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
            stale.append((copied, f"источник {origin['source']} отсутствует"))
        elif hashlib.sha256(source.read_bytes()).hexdigest() != origin['source_sha256']:
            stale.append((copied, f"источник {origin['source']} изменился"))
    assert not stale, ('комплект устарел, запустите python scripts/build_submission.py: '
                       f'{stale}')
