"""CLI проверяет принятый метод до поиска, а параметры — после флагов."""
import importlib
import json

import pytest

from engine.cli import main


# В репозитории engine — совместимый импорт, в автономной сборке — сам движок.
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
