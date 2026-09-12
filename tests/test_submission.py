"""Комплект содержит то же ядро и те же входы; отсутствие PDF не скрывается."""
import hashlib
import json
from pathlib import Path

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
