"""Диагностика ограничений: условие → порог → фактическое значение → PASS/FAIL.

Канонический `check_constraints()` возвращает только булево значение на каждое ограничение.
Инструкция кейса прямо называет «скрытый boolean без объяснения» худшим вариантом, поэтому
здесь мы обогащаем тот же набор проверок порогом, фактом и запасом (критерий Т3).

Важно: наш вывод **сверяется** с каноническим ответом — см. `diagnose()`. Если наша
интерпретация ограничения когда-нибудь разойдётся с кодом организаторов, тест и расчёт
упадут, а не покажут красивую, но неверную таблицу.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

from .canonical import canonical_checks, load_case

#: Тот же технический допуск, что в каноническом коде.
TOLERANCE = 1e-9


@dataclass(frozen=True)
class ConstraintRow:
    """Одна строка диагностики ограничения."""

    code: str
    title: str
    operator: str
    threshold: float
    actual: float
    unit: str
    passed: bool

    @property
    def slack(self) -> float | None:
        """Запас до порога: положительный — есть люфт, отрицательный — нарушение."""
        if self.operator == "<=":
            return self.threshold - self.actual
        if self.operator == ">=":
            return self.actual - self.threshold
        return 0.0 if self.passed else None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "title": self.title,
            "operator": self.operator,
            "threshold": self.threshold,
            "actual": self.actual,
            "unit": self.unit,
            "slack": self.slack,
            "status": "PASS" if self.passed else "FAIL",
        }


def constraint_definitions(scenario: str) -> List[Dict[str, Any]]:
    """Описание всех ограничений кейса для указанного сценария."""
    _, _, config = load_case()
    common = config["constraints_common"]
    limit_c0 = config["scenarios"][scenario]["c0_max_mrub"]

    return [
        {
            "code": "exact_lot_count",
            "title": "Ровно четыре уникальных лота",
            "metric": "selected_lots",
            "operator": "==",
            "threshold": common["selected_lots_exactly"],
            "unit": "шт.",
        },
        {
            "code": "territorial_archetypes",
            "title": "Территориальные архетипы (без федеральных лотов)",
            "metric": "territorial_archetypes",
            "operator": ">=",
            "threshold": common["min_territorial_archetypes"],
            "unit": "шт.",
        },
        {
            "code": "capability_groups",
            "title": "Разные группы космических возможностей",
            "metric": "capability_groups",
            "operator": ">=",
            "threshold": common["min_capability_groups"],
            "unit": "шт.",
        },
        {
            "code": "public_core_lots",
            "title": "Лоты в режиме с public_core",
            "metric": "public_core_lots",
            "operator": ">=",
            "threshold": common["min_public_core_lots"],
            "unit": "шт.",
        },
        {
            "code": "c0_limit",
            "title": f"Стартовые затраты портфеля ({scenario})",
            "metric": "c0_mrub",
            "operator": "<=",
            "threshold": limit_c0,
            "unit": "млн ₽",
        },
        {
            "code": "opex_limit",
            "title": "Годовые эксплуатационные расходы",
            "metric": "opex_mrub_per_year",
            "operator": "<=",
            "threshold": common["opex_max_mrub_per_year"],
            "unit": "млн ₽/год",
        },
        {
            "code": "vpub_floor",
            "title": "Общественная ценность портфеля",
            "metric": "vpub_mrub_per_year",
            "operator": ">=",
            "threshold": common["vpub_min_mrub_per_year"],
            "unit": "млн ₽/год",
        },
        {
            "code": "kcash_floor",
            "title": "Покрытие OPEX поступлениями (cash / opex)",
            "metric": "kcash",
            "operator": ">=",
            "threshold": common["kcash_min"],
            "unit": "доля",
        },
        {
            "code": "t_rep_floor",
            "title": "Средний t_rep по выбранным лотам",
            "metric": "t_rep",
            "operator": ">=",
            "threshold": common["t_rep_min"],
            "unit": "—",
        },
    ]


def _compare(actual: float, operator: str, threshold: float) -> bool:
    if operator == "==":
        return actual == threshold
    if operator == "<=":
        return actual <= threshold + TOLERANCE
    if operator == ">=":
        return actual >= threshold - TOLERANCE
    raise ValueError(f"Неизвестный оператор: {operator}")


def diagnose(metrics: Dict[str, Any], scenario: str = "BASE") -> List[ConstraintRow]:
    """Полная диагностика ограничений со сверкой с каноническим ответом."""
    rows: List[ConstraintRow] = []
    for item in constraint_definitions(scenario):
        actual = float(metrics.get(item["metric"], float("nan")))
        passed = _compare(actual, item["operator"], float(item["threshold"]))
        rows.append(
            ConstraintRow(
                code=item["code"],
                title=item["title"],
                operator=item["operator"],
                threshold=float(item["threshold"]),
                actual=actual,
                unit=item["unit"],
                passed=passed,
            )
        )

    # Страховка от расхождения с кодом организаторов: наш вывод обязан совпасть.
    reference = canonical_checks(metrics, scenario=scenario)
    mismatched = [r.code for r in rows if reference.get(r.code) != r.passed]
    if mismatched:
        raise AssertionError(
            "Диагностика разошлась с каноническим check_constraints по: "
            + ", ".join(mismatched)
        )
    return rows


def all_passed(rows: List[ConstraintRow]) -> bool:
    return all(row.passed for row in rows)


def failed(rows: List[ConstraintRow]) -> List[ConstraintRow]:
    return [row for row in rows if not row.passed]
