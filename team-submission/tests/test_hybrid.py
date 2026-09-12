"""Проверки нового правила выбора; старые наборы данных не переисследуются."""
import json
from fractions import Fraction

import pandas as pd
import pytest

from engine.hybrid import CRITERIA, Parameters, analyze, exact, score_frame, select
from engine import evaluate, diagnose


@pytest.fixture(scope="module")
def baseline():
    return analyze(Parameters())


def test_automatic_delta_is_smallest_loss_for_global_q(baseline):
    _, candidates, report = baseline
    assert len(candidates) == 143
    assert report["winner"]["selection_id"] == "AGRI:C,ENV:A,FIRE:A,TRANS:C"
    assert report["winner"]["q_exact"] == "1/2"
    assert report["winner"]["annual_surplus_mrub"] == pytest.approx(92.25)
    assert report["effective_delta_mrub"] == pytest.approx(9.5)
    assert report["s_max_mrub"] == pytest.approx(101.75)
    assert report["cash_floor_mrub"] == pytest.approx(92.25)
    scored = score_frame(candidates, report["bounds"])
    qmax = max(scored.q_exact)
    assert all(q < qmax for q in scored.loc[scored.surplus_exact > exact(92.25), "q_exact"])
    assert report["winner"]["q"] == float(qmax)


@pytest.mark.parametrize("delta,s,q", [(0,101.75,0),(2.24999999,101.75,0),(2.25,99.5,.125),
                                       (7.24999999,99.5,.125),(7.25,94.5,1072/3690),
                                       (9.49999999,94.5,1072/3690),(9.5,92.25,.5),(200,92.25,.5)])
def test_cash_boundaries_are_inclusive(baseline, delta, s, q):
    _, candidates, report = baseline
    row, stages = select(score_frame(candidates, report["bounds"]), delta)
    assert float(row.surplus) == pytest.approx(s)
    assert float(row.q_exact) == pytest.approx(q)
    assert exact(row.surplus) >= exact(stages["cash_floor_mrub"])


def test_switching_curve_and_canonical_winners(baseline):
    report = baseline[2]
    assert [p["delta_from_mrub"] for p in report["switching_curve"]] == [0,2.25,7.25,9.5]
    assert [p["delta_to_exclusive_mrub"] for p in report["switching_curve"]] == [2.25,7.25,9.5,None]
    for point in report["switching_curve"]:
        winner = point["winner"]
        _, metrics = evaluate([(i["lot_id"],i["mode_id"]) for i in winner["selection"]])
        assert metrics["cash_mrub_per_year"]-metrics["opex_mrub_per_year"] == pytest.approx(winner["annual_surplus_mrub"])
        assert metrics["c0_mrub"] == pytest.approx(winner["c0_mrub"])
        for scenario in ("BASE","STRESS"):
            assert all(row.passed for row in diagnose(metrics, scenario))


def test_scales_do_not_change_with_delta_scope_or_extra_filters(baseline):
    original = baseline[2]
    for params in (Parameters(cash_loss_limit_mrub=0), Parameters(lot_ids=("FIRE","AGRI","TRANS","ENV")),
                   Parameters(budget_cap_mrub=1150)):
        report = analyze(params, include_sensitivity=False)[2]
        assert report["bounds"] == original["bounds"]
        assert report["reference_count"] == original["reference_count"]


def test_exact_q_ties_choose_money_then_dominance_then_id():
    rows = [dict(stable_id=key,vpub=1,surplus=s,c0=1,readiness=r,resilience=1,scale=1)
            for key,s,r in [("z",1,1),("b",2,1),("c",2,2),("a",2,2)]]
    frame = pd.DataFrame(rows)
    bounds = {key:(0,4) for key,_,_ in CRITERIA}
    scored = score_frame(frame,bounds)
    assert all(q == Fraction(1,4) for q in scored.q_exact)
    assert select(scored,10)[0].stable_id == "a"
    assert select(scored.iloc[::-1],10)[0].stable_id == "a"
    # A difference above the documented 1e-8 precision must not be treated as an epsilon tie.
    scored.loc[scored.stable_id == "z", "q_exact"] += Fraction(1,10000000)
    assert select(scored,10)[0].stable_id == "z"


def test_constant_criterion_and_cost_direction():
    frame = pd.DataFrame([{key:1. for key,_,_ in CRITERIA},{key:2. for key,_,_ in CRITERIA}])
    bounds = {key:(1,2) for key,_,_ in CRITERIA}
    bounds["scale"] = (1,1)
    scored = score_frame(frame,bounds)
    assert scored.normalized_c0.tolist() == [1,0]
    assert scored.normalized_vpub.tolist() == [0,1]
    assert scored.normalized_scale.tolist() == [1,1]


def test_winner_not_dominated_and_reproducible(baseline):
    _, candidates, report = baseline
    scored = score_frame(candidates,report["bounds"])
    for point in report["switching_curve"]:
        winner = scored.loc[scored.stable_id == point["winner"]["selection_id"]].iloc[0]
        cols = [f"normalized_{key}" for key,_,_ in CRITERIA]
        assert not ((scored[cols] >= winner[cols]).all(axis=1) & (scored[cols] > winner[cols]).any(axis=1)).any()
    assert json.dumps(report,sort_keys=True,allow_nan=False) == json.dumps(analyze(Parameters())[2],sort_keys=True,allow_nan=False)


def test_shock_is_recalculated_with_frozen_scales(baseline):
    report = baseline[2]
    combined = next(case for case in report["sensitivity"] if case["id"] == "combined")
    assert combined["outcome"]["original_adjusted_surplus_mrub"] == pytest.approx(398*.9-305.75*1.05)
    if combined["outcome"]["winner"]:
        assert combined["outcome"]["winner"]["annual_surplus_mrub"] >= combined["cash_floor_mrub"]-1e-8
        for c in combined["outcome"]["winner"]["components"]:
            assert (c["minimum"], c["maximum"]) == report["bounds"][c["key"]]


@pytest.mark.parametrize("kwargs", [{"cash_loss_limit_mrub":-1},{"cash_loss_limit_mrub":True},{"require_stress":"false"},{"cash_loss_limit_mrub":float('nan')},
                                    {"cash_loss_limit_mrub":float('inf')},{"quality_epsilon":.001},
                                    {"budget_cap_mrub":0},{"lot_ids":("FIRE",)*4}])
def test_reject_invalid_parameters(kwargs):
    with pytest.raises(ValueError):
        Parameters(**kwargs)


def test_no_feasible_has_no_invented_scores():
    report = analyze(Parameters(budget_cap_mrub=1))[2]
    assert report["winner"] is None and report["q_max"] is None
    assert report["switching_curve"] == [] and report["cash_eligible_count"] == 0
    json.dumps(report,allow_nan=False)
