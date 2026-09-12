import json

from .canonical import dataset_hash, evaluate, load_case, source_version
from .constraints import all_passed, diagnose
from .sensitivity import verify_headroom
from .space import enumerate_space


def run_selfcheck() -> dict[str, object]:
    selection = [("FIRE", "A"), ("AGRI", "A"), ("TRANS", "B"), ("ENV", "A")]
    first = evaluate(selection)[1]
    second = evaluate(list(reversed(selection)))[1]
    assert json.dumps(first, sort_keys=True, allow_nan=False) == json.dumps(second, sort_keys=True, allow_nan=False)
    assert dataset_hash() == source_version(), "Исходные файлы изменены после загрузки движка"
    for scenario in ("BASE", "STRESS"):
        assert all_passed(diagnose(first, scenario)), scenario
        assert verify_headroom(selection, scenario), scenario
    frame = enumerate_space()
    assert len(frame) == 5670
    assert (int(frame.BASE_ok.sum()), int(frame.STRESS_ok.sum())) == (1031, 143)
    assert not (frame.STRESS_ok & ~frame.BASE_ok).any()
    lots, _, _ = load_case()
    lots.loc[0, "c0_mrub"] = -1
    assert load_case()[0].iloc[0].c0_mrub > 0
    from .hybrid import Parameters, analyze
    from .decision import load_decision
    decision = load_decision()
    analysis = decision.analysis
    repeated = analyze(Parameters(**decision.algorithm_parameters))[2]
    assert json.dumps(analysis, sort_keys=True, allow_nan=False) == json.dumps(repeated, sort_keys=True, allow_nan=False)
    winner = analysis["winner"]
    assert winner["q"] == min(component["normalized"] for component in winner["components"])
    chosen_metrics = evaluate(decision.recommended.selection)[1]
    assert abs(chosen_metrics["cash_mrub_per_year"] - chosen_metrics["opex_mrub_per_year"] - winner["annual_surplus_mrub"]) < 1e-8
    assert all_passed(diagnose(chosen_metrics, "STRESS" if decision.algorithm_parameters.get("require_stress", True) else "BASE"))
    return {"status": "ok", "method": "hybrid_maximin_v1", "winner": winner["selection_id"],
            "q": winner["q"], "delta_mrub": analysis["effective_delta_mrub"], "dataset_hash": source_version(), "variants": len(frame),
            "base_feasible": int(frame.BASE_ok.sum()), "stress_feasible": int(frame.STRESS_ok.sum())}
