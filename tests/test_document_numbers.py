"""Каждое число отчётов выведено из выгрузок движка (критерий «цифры должны совпадать»).

Дополняет test_documents_match_engine: там проверяются опорные метрики, здесь — весь реестр
фактов, включая пролотовые суммы, распределение запуска по бюджетам и пределы чувствительности,
а также утверждения об отношениях величин, которые нельзя заменить автоматически.
"""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))

import sync_documents  # noqa: E402


@pytest.fixture(scope='module')
def facts():
    return sync_documents.collect()


def test_registry_is_not_trivial(facts):
    assert len(facts) >= 40, 'реестр фактов подозрительно мал — проверьте collect()'


def test_every_fact_appears_in_its_documents(facts):
    absent = [(name, value, document)
              for name, (value, documents) in facts.items()
              for document in documents
              if value not in (ROOT / document).read_text(encoding='utf-8')]
    assert not absent, f'числа разошлись с документами: {absent}'


def test_relational_claims_still_hold():
    broken = [(label, round(value, 3), low, high)
              for label, value, low, high in sync_documents.relations()
              if not low <= value < high]
    assert not broken, f'фразы об отношениях величин устарели: {broken}'


def test_snapshot_matches_current_facts(facts):
    """Слепок коммитится: расхождение означает, что расчёт изменился, а документы — нет."""
    import json

    snapshot = json.loads((ROOT / 'results/document_facts.json').read_text(encoding='utf-8'))
    drift = {name: (snapshot.get(name), value)
             for name, (value, _) in facts.items() if snapshot.get(name) != value}
    assert not drift, ('слепок устарел, запустите python scripts/sync_documents.py --fix: '
                       f'{drift}')
