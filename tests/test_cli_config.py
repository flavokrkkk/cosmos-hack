"""CLI проверяет принятый метод до поиска, а параметры — после флагов."""
import importlib
import json

import pytest

from backend.app.core.services.portfolio_engine.cli import main


# В автономном комплекте сборщик адаптирует только путь импорта этого же движка.
cli = importlib.import_module(main.__module__)
decision = importlib.import_module(f"{cli.__package__}.decision")
hybrid = importlib.import_module(f"{cli.__package__}.hybrid")


@pytest.mark.parametrize("method", [None, "unknown", "cash_surplus_v1", "weighted_mcda_v1", "pareto_lexicographic_v1", "leximin"])
def test_unsupported_config_method_rejected_before_search(tmp_path, monkeypatch, capsys, method):
    data = {"algorithm_parameters": {}}
    if method is not None:
        data["decision_method"] = method
    path = tmp_path / "decision.json"
    path.write_text(json.dumps(data), encoding="utf-8")

    def forbidden_search(*args, **kwargs):
        pytest.fail("Неподдерживаемый метод не должен запускать поиск")

    monkeypatch.setattr(hybrid, "analyze", forbidden_search)
    assert main(["--config", str(path), "recommend", "--delta", "0"]) == 2
    assert f"Поддерживается только {hybrid.METHOD_ID}" in capsys.readouterr().out
    with pytest.raises(ValueError, match=f"Поддерживается только {hybrid.METHOD_ID}"):
        decision.load_decision(path)


@pytest.mark.parametrize(
    "parameters,flags,expected_delta,expected_stress",
    [
        ({}, [], None, True),
        ({"cash_loss_limit_mrub": 3, "require_stress": False}, [], 3, False),
        ({"cash_loss_limit_mrub": -1, "require_stress": "invalid"},
         ["--delta", "7.25", "--base-only"], 7.25, False),
    ],
)
def test_default_config_and_overrides_forwarded_to_one_search(
    tmp_path, monkeypatch, capsys, parameters, flags, expected_delta, expected_stress,
):
    data = {"decision_method": hybrid.METHOD_ID, "algorithm_parameters": parameters}
    path = tmp_path / "decision.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    monkeypatch.setattr(decision, "DEFAULT_CONFIG_PATH", path)
    seen = []
    result = {"winner": {"selection_id": "stub"}}

    def record_search(applied):
        seen.append(applied)
        return None, None, result

    monkeypatch.setattr(hybrid, "analyze", record_search)
    assert main(["recommend", *flags]) == 0
    assert len(seen) == 1
    assert seen[0].cash_loss_limit_mrub == expected_delta
    assert seen[0].require_stress is expected_stress
    assert json.loads(capsys.readouterr().out) == result
    assert json.loads(path.read_text(encoding="utf-8")) == data


@pytest.mark.parametrize("portfolio,expected_status", [
    ("FIRE:A,AGRI:C,TRANS:C,ENV:A", 0),
    ("FIRE:A,FLOOD:A,AGRI:C,TRANS:C", 1),
])
def test_evaluate_explicit_portfolio_compares_scenarios_without_search(
    monkeypatch, capsys, portfolio, expected_status,
):
    def forbidden_search(*args, **kwargs):
        pytest.fail("Явный портфель не требует подбора другого состава")

    monkeypatch.setattr(cli, "load_decision", forbidden_search)
    assert main(["evaluate", "--portfolio", portfolio]) == expected_status
    output = capsys.readouterr().out
    assert portfolio in output
    assert "SHA-256 входов кейса:" in output
    assert "S = CASH − OPEX" in output
    assert "сценарий BASE" in output and "сценарий STRESS" in output
    base, stress = output.split("=== Ограничения, сценарий STRESS ===")
    assert "FAIL" not in base
    if expected_status:
        assert "c0_limit" in stress and "FAIL" in stress
        assert "фактически 1192.8000" in stress
    else:
        assert "FAIL" not in stress


def test_empty_explicit_portfolio_is_not_silently_replaced(monkeypatch, capsys):
    def forbidden_search(*args, **kwargs):
        pytest.fail("Пустой --portfolio нельзя незаметно заменить рекомендацией")

    monkeypatch.setattr(cli, "load_decision", forbidden_search)
    assert main(["evaluate", "--portfolio", ""]) == 2
    assert "Портфель не может быть пустым" in capsys.readouterr().out


def test_missing_config_is_an_input_error(tmp_path, capsys):
    assert main(["--config", str(tmp_path / "missing.json"), "recommend"]) == 2
    assert "Не найден конфиг решения" in capsys.readouterr().out


def test_compare_keeps_all_six_criteria_and_cash_flows_visible(monkeypatch, capsys):
    from types import SimpleNamespace

    variants = [
        decision.Variant("ACCA", [("FIRE", "A"), ("AGRI", "C"), ("TRANS", "C"), ("ENV", "A")]),
        decision.Variant("ABBA", [("FIRE", "A"), ("AGRI", "B"), ("TRANS", "B"), ("ENV", "A")]),
    ]
    config = SimpleNamespace(variants=variants, inputs=None, algorithm_parameters={"require_stress": True})
    monkeypatch.setattr(cli, "load_decision", lambda _path: config)
    assert main(["compare"]) == 0
    output = capsys.readouterr().out
    for header in ("C0", "OPEX", "CASH", "S", "VPUB", "readiness_1_5", "resilience_1_5", "scale_1_5"):
        assert header in output
    assert '"require_stress": true' in output
    for variant in variants:
        assert cli.format_selection(variant.selection) in output
    assert "92.25" in output and "57.50" in output
    assert "BASE" in output and "STRESS" in output
