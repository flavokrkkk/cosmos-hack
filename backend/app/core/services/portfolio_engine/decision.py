"""Решение команды: портфель, альтернативы и управленческие поля.

Всё, что эксперт может менять, лежит в `config/decision.json` — **править код не нужно**
(критерий Т2). Файл же служит источником для экспорта `team_decision_config.json`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .canonical import REPO_ROOT

DEFAULT_CONFIG_PATH = REPO_ROOT / "config" / "decision.json"


@dataclass(frozen=True)
class Variant:
    """Именованный вариант портфеля: состав лотов и режимы доступа."""

    name: str
    selection: List[Tuple[str, str]]
    comment: str = ""

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "Variant":
        return Variant(
            name=str(data["name"]),
            selection=[(str(lot), str(mode)) for lot, mode in data["selection"]],
            comment=str(data.get("comment", "")),
        )


@dataclass(frozen=True)
class Decision:
    """Полная карточка решения команды."""

    team_name: str
    decision_method: str
    strategy_thesis: str
    scenario: str
    algorithm_parameters: Dict[str, Any]
    analysis: Dict[str, Any]
    recommended: Variant
    alternatives: List[Variant] = field(default_factory=list)
    management: Dict[str, str] = field(default_factory=dict)
    assumptions: List[Dict[str, str]] = field(default_factory=list)

    @property
    def variants(self) -> List[Variant]:
        """Рекомендация и альтернативы в одном списке — для сравнения."""
        return [self.recommended] + list(self.alternatives)

    def as_export(self) -> Dict[str, Any]:
        return {
            "team_name": self.team_name,
            "decision_method": self.decision_method,
            "strategy_thesis": self.strategy_thesis,
            "scenario": self.scenario,
            "algorithm_parameters": self.algorithm_parameters,
            "recommended": {
                "name": self.recommended.name,
                "selection": [list(pair) for pair in self.recommended.selection],
            },
            "alternatives": [
                {"name": v.name, "selection": [list(p) for p in v.selection], "comment": v.comment}
                for v in self.alternatives
            ],
            "management": self.management,
            "assumptions": self.assumptions,
        }


def read_decision_config(path: Path | None = None) -> Dict[str, Any]:
    """Читает входы и проверяет метод, не запуская поиск и не применяя параметры.

    CLI может переопределить параметры до их валидации и единственного расчёта.
    Идентификатор метода обязателен для всех команд, использующих конфигурацию.
    """
    config_path = Path(path) if path else DEFAULT_CONFIG_PATH
    if not config_path.exists():
        raise FileNotFoundError(
            f"Не найден конфиг решения: {config_path}. "
            "Он задаёт параметры алгоритма и альтернативы; править исходный код для этого не нужно."
        )
    with open(config_path, encoding="utf-8") as handle:
        data = json.load(handle)

    from .hybrid import METHOD_ID
    if not isinstance(data, dict):
        raise ValueError("Конфигурация решения должна быть JSON-объектом")
    if data.get("decision_method") != METHOD_ID:
        raise ValueError(f"Поддерживается только {METHOD_ID}")
    return data


def load_decision(path: Path = None) -> Decision:
    """Читает конфигурацию и вычисляет решение команды."""
    from .hybrid import Parameters, analyze

    data = read_decision_config(path)
    parameters = Parameters(**data["algorithm_parameters"])
    _, _, analysis = analyze(parameters)
    winner = analysis["winner"]
    if winner is None:
        raise ValueError("При заданных условиях нет допустимого портфеля")
    recommended = Variant("Результат гибридного алгоритма",
                          [(item["lot_id"], item["mode_id"]) for item in winner["selection"]],
                          "Q → S; состав вычислен по входам конфигурации.")
    return Decision(
        team_name=str(data.get("team_name", "")),
        decision_method=str(data.get("decision_method", "")),
        strategy_thesis=str(data.get("strategy_thesis", "")),
        scenario="STRESS" if parameters.require_stress else "BASE",
        algorithm_parameters=data["algorithm_parameters"],
        analysis=analysis,
        recommended=recommended,
        alternatives=[Variant.from_dict(item) for item in data.get("alternatives", [])],
        management=dict(data.get("management", {})),
        assumptions=list(data.get("assumptions", [])),
    )
