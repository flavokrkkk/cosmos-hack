"""Каждое число отчётов выведено из выгрузок движка (критерий «цифры должны совпадать»).

Дополняет test_documents_match_engine: там проверяются опорные метрики, здесь — весь реестр
фактов, включая пролотовые суммы, распределение запуска по бюджетам и пределы чувствительности,
а также утверждения об отношениях величин, которые нельзя заменить автоматически.
"""
import sys
import re
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


def test_defence_comparison_facts_are_registered(facts):
    for name, expected in {
        'FLOOD-вариант: Q': '0,125',
        'FLOOD-вариант: прирост VPUB, %': '3,3',
        'конфигураций с максимальным Q': '11',
    }.items():
        value, documents = facts[name]
        assert value == expected
        assert documents == (sync_documents.NOTE, sync_documents.SLIDES)


def test_presentation_timing_fits_four_minutes():
    text = (ROOT / sync_documents.SLIDES).read_text(encoding='utf-8')
    slides = [(int(number), int(seconds)) for number, seconds in
              re.findall(r'^\|\s*(\d+)\s*\|.*\|\s*(\d+)\s*\|\s*$', text, flags=re.M)]
    assert 1 <= len(slides) <= 12, 'в таблице должны быть слайды с явным временем'
    assert [number for number, _ in slides] == list(range(1, len(slides) + 1))
    total = sum(seconds for _, seconds in slides)
    assert total <= 240, f'план защиты занимает {total} секунд при лимите 240'
    declared = re.search(r'Сумма — \*\*(\d+) секунд\*\*, резерв — (\d+) секунд', text)
    assert declared, 'сумма и резерв должны быть явно указаны рядом с таблицей'
    assert (int(declared[1]), int(declared[2])) == (total, 240 - total)


def test_every_fact_appears_in_its_documents(facts):
    absent = [(name, value, document)
              for name, (value, documents) in facts.items()
              for document in documents
              if not sync_documents.contains_value((ROOT / document).read_text(encoding='utf-8'), value)]
    assert not absent, f'числа разошлись с документами: {absent}'


def test_relational_claims_still_hold():
    broken = [(label, round(value, 3), low, high)
              for label, value, low, high in sync_documents.relations()
              if not low <= value < high]
    assert not broken, f'фразы об отношениях величин устарели: {broken}'


def test_snapshot_matches_current_facts(facts):
    """Слепок коммитится: расхождение означает, что расчёт изменился, а документы — нет."""
    import json

    snapshot = json.loads((ROOT / 'results/team_decision_config.json').read_text(encoding='utf-8'))['document_values']
    drift = {name: (snapshot.get(name), value)
             for name, (value, _) in facts.items() if snapshot.get(name) != value}
    assert not drift, ('слепок устарел, запустите python scripts/sync_documents.py --fix: '
                       f'{drift}')


def test_choice_sensitivity_claims_in_the_note_hold():
    """Раздел 3.3 записки описывает сценарии повторного подбора — сверяем с выгрузкой."""
    import json

    report = json.loads((ROOT / 'results/hybrid_analysis.json').read_text(encoding='utf-8'))
    base = report['winner']['selection_id']
    scenarios = {s['id']: s for s in report['sensitivity']}

    def winner(scenario_id):
        outcome = scenarios[scenario_id]['outcome'] or {}
        return (outcome.get('winner') or {}).get('selection_id')

    # Победитель не меняется при операционных шоках и мягких ужесточениях.
    for scenario_id in ('cash_drop', 'opex_growth', 'combined', 'budget_1', 'vpub_10',
                        'public_FIRE', 'public_ENV'):
        assert winner(scenario_id) == base, scenario_id
    for scenario_id in ('cash_drop', 'opex_growth', 'combined'):
        assert scenarios[scenario_id]['feasible_count'] == 143, scenario_id
    # Меняется при пороге VPUB +20%: TRANS уходит в B.
    assert winner('vpub_20') != base and 'TRANS:B' in winner('vpub_20')
    # При лимите −5% допустимых конфигураций нет вообще — тот же абсолютный предел 1123,5.
    assert scenarios['budget_5']['feasible_count'] == 0
    assert scenarios['budget_5']['budget_cap_mrub'] < 1123.5 <= scenarios['budget_1']['budget_cap_mrub']
