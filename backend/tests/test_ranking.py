import itertools
import json

import pandas as pd
import pytest
from pydantic import ValidationError

from app.core.dto.portfolio import EvaluateRequest, RankingWeights, RecommendRequest, SelectionItem
from app.core.services.portfolio_engine import canonical, space
from app.core.services.portfolio_ranking_service import score_frame
from app.core.services.portfolio_service import PortfolioService
from app.core.services.recommendation_service import RecommendationService


def recommend(**kwargs):
    return RecommendationService().recommend(RecommendRequest(
        dataset_hash=canonical.source_version(), method_id="cash_surplus_v1", **kwargs,
    ))


def test_fast_enumeration_matches_all_canonical_results():
    reference = pd.DataFrame([
        space.metrics_row(list(zip(combo, assignment)))
        for combo in itertools.combinations(canonical.lot_ids(), 4)
        for assignment in itertools.product(canonical.mode_ids(), repeat=4)
    ])
    actual = space.enumerate_space()
    pd.testing.assert_frame_equal(actual[reference.columns], reference, check_exact=True)
    assert (len(actual), int(actual.BASE_ok.sum()), int(actual.STRESS_ok.sum())) == (5670, 1031, 143)
    actual.iloc[0, 0] = "mutated"
    assert space.enumerate_space().iloc[0, 0] != "mutated"


@pytest.mark.parametrize("require_stress,expected", [(True, 101.75), (False, 104)])
def test_financial_winner_has_no_hidden_three_core_or_five_percent_filter(require_stress, expected):
    result = recommend(require_stress=require_stress)
    assert result.recommended.calculation.financial.annual_surplus_mrub == pytest.approx(expected)
    assert result.recommended.calculation.metrics.public_core_lots == 2
    assert result.recommended.calculation.feasible_by_scenario["BASE"]
    frame = space.feasible("STRESS" if require_stress else "BASE")
    assert expected == pytest.approx((frame.cash - frame.opex).max())
    assert len(result.alternatives) <= 4


def test_weighted_winner_score_is_auditable_and_uses_same_pool():
    result = recommend()
    weighted = result.analysis.methods[1]
    assert len(weighted.components) == 8
    assert sum(item.weight for item in weighted.components) == pytest.approx(1)
    assert sum(item.contribution for item in weighted.components) == pytest.approx(weighted.score)
    frame = space.feasible("STRESS")
    independent = pd.Series(0., index=frame.index)
    for component in weighted.components:
        column = frame[component.key]
        assert component.minimum == column.min()
        assert component.maximum == column.max()
        scaled = (column - column.min()) / (column.max() - column.min()) if column.max() != column.min() else column * 0 + 1
        if component.direction == "min" and column.max() != column.min():
            scaled = 1 - scaled
        independent += scaled * component.weight
    assert weighted.score == pytest.approx(independent.max())


def test_sensitivity_changes_winner_and_evaluates_original():
    result = recommend()
    cases = {item.id: item for item in result.analysis.sensitivity}
    budget = cases["budget_1"].outcomes["cash_surplus_v1"]
    assert budget.winner_changed and not budget.original_still_feasible
    assert budget.winner.c0_mrub <= 1180 * .99 + 1e-9
    combined = cases["combined"].outcomes["cash_surplus_v1"]
    metrics = result.recommended.calculation.metrics
    assert combined.original_adjusted_surplus_mrub == pytest.approx(metrics.cash_mrub_per_year * .9 - metrics.opex_mrub_per_year * 1.05)
    access = cases["public_AGRI"].outcomes["cash_surplus_v1"]
    assert access.winner_changed and not access.original_still_feasible
    if access.winner:
        assert ("AGRI", "A") in [(item.lot_id, item.mode_id) for item in access.winner.selection]


def test_explicit_conditions_and_manual_scope():
    result = recommend(lot_ids=["FIRE", "AGRI", "TRANS", "ENV"], budget_cap_mrub=1150,
                       required_public_lot_ids=["FIRE", "ENV"], vpub_floor_mrub_per_year=1250)
    assert result.status == "ok"
    assert result.considered_count == 81
    for item in result.analysis.methods:
        assert {part.lot_id for part in item.selection} == {"FIRE", "AGRI", "TRANS", "ENV"}
        assert {"FIRE", "ENV"}.issubset({part.lot_id for part in item.selection if part.mode_id == "A"})
        assert item.c0_mrub <= 1150 and item.vpub_mrub_per_year >= 1250
    assert result.recommended.calculation.financial.annual_surplus_mrub == pytest.approx(57.5)


def test_no_feasible_and_deterministic_cache_isolation():
    result = recommend(budget_cap_mrub=1)
    assert result.status == "no_feasible" and result.recommended is None and not result.analysis.methods
    first = recommend()
    serialized = first.model_dump_json()
    first.analysis.methods.clear()
    assert recommend().model_dump_json() == serialized
    assert recommend(budget_cap_mrub=1150).input_hash != recommend().input_hash
    json.loads(serialized, parse_constant=lambda value: pytest.fail(value))


def test_weights_and_conditions_validation():
    with pytest.raises(ValidationError):
        RankingWeights(vpub=float("nan"))
    with pytest.raises(ValidationError):
        RankingWeights(**{key: 0 for key in RankingWeights.model_fields})
    with pytest.raises(ValidationError):
        RecommendRequest(dataset_hash=canonical.source_version(), required_public_lot_ids=["FIRE", "FIRE"])
    with pytest.raises(ValidationError):
        recommend(lot_ids=["FIRE", "AGRI", "TRANS", "ENV"], required_public_lot_ids=["FLOOD"])


def test_constant_criteria_and_cost_direction():
    frame = pd.DataFrame([{key: 1. for key in RankingWeights.model_fields}, {key: 2. for key in RankingWeights.model_fields}])
    bounds = {key: (1, 2) for key in RankingWeights.model_fields}
    bounds["t_rep"] = (1, 1)
    scored = score_frame(frame, {key: 1 / 8 for key in bounds}, bounds)
    assert scored.normalized_c0.tolist() == [1, 0]
    assert scored.normalized_vpub.tolist() == [0, 1]
    assert scored.normalized_t_rep.tolist() == [1, 1]


@pytest.mark.parametrize("modes,expected", [("AABA", 5.75), ("ABBA", 57.5), ("ACAA", 43.5)])
def test_financial_breakdown_and_break_even(modes, expected):
    selection = [SelectionItem(lot_id=lot, mode_id=mode) for lot, mode in zip(["FIRE", "AGRI", "TRANS", "ENV"], modes)]
    result = PortfolioService().evaluate(EvaluateRequest(dataset_hash=canonical.source_version(), selection=selection))
    money, metrics = result.financial, result.metrics
    assert money.annual_surplus_mrub == pytest.approx(expected)
    assert money.anchor_cash_mrub_per_year + money.commercial_cash_mrub_per_year == pytest.approx(metrics.cash_mrub_per_year)
    assert metrics.cash_mrub_per_year * (1 - money.cash_drop_break_even_pct / 100) == pytest.approx(metrics.opex_mrub_per_year)
    assert metrics.opex_mrub_per_year * (1 + money.opex_growth_break_even_pct / 100) == pytest.approx(metrics.cash_mrub_per_year)
    assert money.startup_headroom_mrub["STRESS"] == pytest.approx(1180 - metrics.c0_mrub)


def test_loss_has_funding_gap_not_positive_headroom():
    result = PortfolioService().evaluate(EvaluateRequest(dataset_hash=canonical.source_version(), selection=[SelectionItem(lot_id="FIRE", mode_id="A")]))
    assert not result.financial.operating_self_financed
    assert result.financial.annual_funding_gap_mrub > 0
    assert result.financial.cash_drop_break_even_pct is None
    assert result.financial.opex_growth_break_even_pct is None
