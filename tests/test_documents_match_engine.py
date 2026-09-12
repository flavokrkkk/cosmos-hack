"""Текущий документ и контрольные выгрузки должны описывать вычисленный выбор."""
import json
from pathlib import Path

import pandas as pd
import pytest

from engine import evaluate, load_decision

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def decision():
    return load_decision()


def test_current_document_matches_computed_portfolio(decision):
    note = (ROOT/'docs/22-hybrid-selection.md').read_text()
    for lot, mode in decision.recommended.selection:
        assert f'{lot}:{mode}' in note
    _, metrics = evaluate(decision.recommended.selection)
    for key, digits in [('c0_mrub',1),('opex_mrub_per_year',2),('cash_mrub_per_year',1),('vpub_mrub_per_year',1)]:
        assert f'{metrics[key]:.{digits}f}'.replace('.',',') in note
    assert str(decision.analysis['winner']['q']).replace('.',',') in note
    assert str(decision.analysis['effective_delta_mrub']).replace('.',',') in note


def test_control_exports_match_current_engine(decision):
    _, metrics = evaluate(decision.recommended.selection)
    exported = json.loads((ROOT/'results/portfolio_metrics.json').read_text())
    assert exported == metrics
    report = json.loads((ROOT/'results/hybrid_analysis.json').read_text())
    assert report == json.loads(json.dumps(decision.analysis))
    for scenario in ('BASE','STRESS'):
        checks = pd.read_csv(ROOT/f'results/constraints_{scenario}.csv')
        assert len(checks) == 9 and (checks.status == 'PASS').all()


def test_input_config_does_not_prescribe_winner():
    config = json.loads((ROOT/'config/decision.json').read_text())
    assert config['decision_method'] == 'hybrid_maximin_v1'
    assert 'recommended' not in config
    assert config['algorithm_parameters']['quality_epsilon'] == 0
    assert config['algorithm_parameters']['cash_loss_limit_mrub'] is None
    assert config['team_name'] == 'ТЧК MISIS'
    assert all(item.get('origin') and item.get('source') for item in config['assumptions'])


def test_superseded_notes_are_not_presented_as_current():
    """Документы под прежний портфель помечены до первого заголовка и ведут на актуальный."""
    for name in ('10-management-note.md','11-stress-summary.md','18-portfolio-selection-algorithm.md',
                 '21-portfolio-balance-and-synergy.md'):
        text = (ROOT/'docs'/name).read_text()
        preamble = text.split('\n# ', 1)[0]
        assert '> Историческая версия' in preamble, name
        banner = next(line for line in preamble.split('\n') if line.startswith('> Историческая версия'))
        assert '22-hybrid-selection.md' in banner, name
