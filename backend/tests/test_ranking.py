import pytest
from pydantic import ValidationError
from app.core.dto.portfolio import EvaluateRequest, RecommendRequest, SelectionItem
from app.core.services.portfolio_engine import canonical
from app.core.services.portfolio_service import PortfolioService
from app.core.services.recommendation_service import RecommendationService


def recommend(**kwargs):
    return RecommendationService().recommend(RecommendRequest(dataset_hash=canonical.source_version(), **kwargs))


def test_single_method_and_auditable_q():
    catalog = PortfolioService().catalog()
    assert [m.id for m in catalog.methods] == ["hybrid_maximin_v1"]
    result = recommend()
    assert len(result.analysis.winner.components) == 6
    assert result.analysis.winner.q == min(c.normalized for c in result.analysis.winner.components)
    assert result.analysis.winner.annual_surplus_mrub == pytest.approx(92.25)
    assert result.analysis.effective_delta_mrub == pytest.approx(9.5)
    assert recommend(cash_loss_limit_mrub=0).analysis.winner.annual_surplus_mrub == pytest.approx(101.75)


@pytest.mark.parametrize("extra", [{"method_id":"cash_surplus_v1"},{"method_id":"weighted_mcda_v1"},
                                    {"method_id":"pareto_lexicographic_v1"},{"weights":{"vpub":1}},
                                    {"quality_epsilon":.01},{"cash_loss_limit_mrub":-1}])
def test_removed_methods_and_invalid_parameters_rejected(extra):
    with pytest.raises(ValidationError):
        recommend(**extra)


def test_no_feasible_and_cache_isolation():
    result = recommend(budget_cap_mrub=1)
    assert result.status == "no_feasible" and result.analysis.winner is None
    first = recommend()
    serialized = first.model_dump_json()
    first.analysis.winner.components.clear()
    assert recommend().model_dump_json() == serialized
    assert recommend(cash_loss_limit_mrub=0).input_hash != recommend().input_hash
    assert recommend(with_explanations=False).input_hash == recommend(with_explanations=True).input_hash


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
