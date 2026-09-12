import pytest
from pydantic import ValidationError

from app.core.dto.portfolio import RecommendRequest
from app.core.services.portfolio_engine.hybrid import Parameters, analyze
from app.core.services.portfolio_engine.space import parse_selection
from app.core.services.portfolio_service import PortfolioService
from app.core.services.recommendation_service import RecommendationService
from app.infrastructure.errors.portfolio_errors import InvalidPortfolio


@pytest.fixture(scope='module')
def baseline():
    return analyze(Parameters(), include_sensitivity=False)


def test_mode_filter_matches_exhaustive_candidates_and_preserves_scales(baseline):
    all_rows, _, report = baseline
    lots = ['AGRI', 'ENV', 'FIRE', 'INFRA', 'TRANS']
    modes = {'FIRE': ['A', 'C'], 'ENV': ['A']}
    frame, candidates, filtered = analyze(Parameters(lot_ids=lots, allowed_modes_by_lot=modes), include_sensitivity=False)
    expected = {row.stable_id for row in all_rows.itertuples()
                if all(lot in lots and (lot not in modes or mode in modes[lot])
                       for lot, mode in parse_selection(row.stable_id))}
    assert set(frame.stable_id) == expected
    assert len(frame) > 81  # More than one four-lot composition remains.
    assert not candidates.empty
    assert filtered['bounds'] == report['bounds']
    assert filtered['reference_count'] == report['reference_count']
    assert filtered['winner']['selection_id'] in expected


def test_empty_modes_restore_all_standard_modes(baseline):
    frame, _, report = analyze(Parameters(allowed_modes_by_lot={'FIRE': []}), include_sensitivity=False)
    assert list(frame.stable_id) == list(baseline[0].stable_id)
    assert report == baseline[2]


def test_api_request_normalizes_empty_and_multiple_modes():
    catalog = PortfolioService().catalog()
    request = RecommendRequest(dataset_hash=catalog.dataset_hash, lot_ids=[],
                               allowed_modes_by_lot={'FIRE': ['C', 'A', 'C'], 'ENV': []},
                               with_explanations=False)
    assert request.lot_ids is None
    assert request.allowed_modes_by_lot == {'FIRE': ['A', 'C']}
    result = RecommendationService().recommend(request)
    assert result.status == 'ok'
    for variant in [result.recommended, *result.alternatives]:
        assert all(item.lot_id != 'FIRE' or item.mode_id in ['A', 'C'] for item in variant.calculation.selection)
    assert RecommendationService().recommend(request) == result


def test_empty_search_is_identical_to_default():
    catalog = PortfolioService().catalog()
    default = RecommendRequest(dataset_hash=catalog.dataset_hash, with_explanations=False)
    empty = RecommendRequest(dataset_hash=catalog.dataset_hash, lot_ids=[], allowed_modes_by_lot={'ENV': []}, with_explanations=False)
    assert RecommendationService().recommend(default) == RecommendationService().recommend(empty)


def test_impossible_mode_restrictions_do_not_silently_fall_back():
    catalog = PortfolioService().catalog()
    result = RecommendationService().recommend(RecommendRequest(
        dataset_hash=catalog.dataset_hash,
        allowed_modes_by_lot={lot.lot_id: ['C'] for lot in catalog.lots},
        with_explanations=False,
    ))
    assert result.status == 'no_feasible'
    assert result.recommended is None


def test_unknown_lots_and_modes_are_rejected():
    catalog = PortfolioService().catalog()
    with pytest.raises(ValidationError):
        RecommendRequest(dataset_hash=catalog.dataset_hash, allowed_modes_by_lot={'FIRE': ['D']})
    with pytest.raises(InvalidPortfolio):
        RecommendationService().recommend(RecommendRequest(dataset_hash=catalog.dataset_hash, allowed_modes_by_lot={'unknown': ['A']}))
