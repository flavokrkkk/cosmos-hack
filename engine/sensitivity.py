"""Анализ устойчивости: насколько можно ошибиться во входных данных.

Отвечает на вопрос, который задаёт жюри: «а если смета вырастет?» и «где ваш портфель
ломается?». Считаем **предельное относительное изменение** каждой группы входов, при котором
портфель ещё проходит ограничения, и какое ограничение упирается первым.

Расчёт аналитический, потому что все агрегаты линейны по своим входам:

```text
c0  ↑ в m раз  →  m ≤ c0_limit / c0
opex ↑ в m раз →  m ≤ min(opex_limit / opex,  kcash / kcash_min)   # opex бьёт по двум ограничениям
cash ↓ в m раз →  m ≥ kcash_min / kcash
vpub ↓ в m раз →  m ≥ vpub_min / vpub
```

Важно: исходные файлы кейса при этом **не изменяются** — мы не подкручиваем `lots.csv`,
а оцениваем запас по уже посчитанным показателям.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

from .canonical import evaluate, load_case
from .constraints import diagnose


@dataclass(frozen=True)
class Headroom:
    """Запас по одной группе входных данных."""

    input_name: str
    direction: str  # "рост" или "падение"
    limit_factor: float  # предельный множитель (1.08 = можно вырасти на 8%)
    change_pct: float  # тот же запас в процентах
    binding: str  # какое ограничение упирается первым

    def as_dict(self) -> Dict[str, Any]:
        return {
            "input": self.input_name,
            "direction": self.direction,
            "limit_factor": round(self.limit_factor, 6),
            "change_pct": round(self.change_pct, 2),
            "binding_constraint": self.binding,
        }


def input_headroom(selection, scenario: str = "BASE") -> List[Headroom]:
    """Предельные изменения входов, при которых портфель ещё допустим."""
    _, _, config = load_case()
    common = config["constraints_common"]
    c0_limit = config["scenarios"][scenario]["c0_max_mrub"]

    _, metrics = evaluate(selection)
    c0 = float(metrics["c0_mrub"])
    opex = float(metrics["opex_mrub_per_year"])
    vpub = float(metrics["vpub_mrub_per_year"])
    kcash = float(metrics["kcash"])

    rows: List[Headroom] = []

    # Стартовые затраты могут вырасти, пока не упрутся в лимит сценария.
    factor_c0 = c0_limit / c0 if c0 else float("inf")
    rows.append(Headroom("c0 (стартовые затраты)", "рост", factor_c0,
                         (factor_c0 - 1) * 100, f"c0_limit ({scenario})"))

    # OPEX бьёт сразу по двум ограничениям: своему лимиту и kcash (cash/opex).
    factor_opex_limit = common["opex_max_mrub_per_year"] / opex if opex else float("inf")
    factor_opex_kcash = kcash / common["kcash_min"] if common["kcash_min"] else float("inf")
    if factor_opex_limit <= factor_opex_kcash:
        factor_opex, binding_opex = factor_opex_limit, "opex_limit"
    else:
        factor_opex, binding_opex = factor_opex_kcash, "kcash_floor"
    rows.append(Headroom("opex (годовые расходы)", "рост", factor_opex,
                         (factor_opex - 1) * 100, binding_opex))

    # Поступления могут упасть, пока kcash не опустится до порога.
    factor_cash = common["kcash_min"] / kcash if kcash else 0.0
    rows.append(Headroom("cash (денежные поступления)", "падение", factor_cash,
                         (1 - factor_cash) * 100, "kcash_floor"))

    # Общественная ценность может упасть до порога vpub.
    factor_vpub = common["vpub_min_mrub_per_year"] / vpub if vpub else 0.0
    rows.append(Headroom("vpub (общественная ценность)", "падение", factor_vpub,
                         (1 - factor_vpub) * 100, "vpub_floor"))

    return rows


def c0_breaking_point(selection) -> Dict[str, Any]:
    """При каком лимите стартовых затрат портфель перестаёт проходить.

    Лимит сценария — внешний параметр, а `c0` портфеля фиксирован. Значит портфель
    допустим ровно до лимита, равного его собственному `c0`.
    """
    _, _, config = load_case()
    _, metrics = evaluate(selection)
    c0 = float(metrics["c0_mrub"])
    stress_limit = config["scenarios"]["STRESS"]["c0_max_mrub"]
    base_limit = config["scenarios"]["BASE"]["c0_max_mrub"]
    return {
        "portfolio_c0": c0,
        "base_limit": base_limit,
        "stress_limit": stress_limit,
        "breaks_below_limit": c0,  # лимит строго меньше c0 => c0_limit FAIL
        "stress_slack": stress_limit - c0,
        "extra_cut_allowed_pct": round((stress_limit - c0) / stress_limit * 100, 2),
    }


def binding_first(selection, scenario: str = "BASE") -> Headroom:
    """Самое узкое место: вход, у которого запас минимален."""
    rows = input_headroom(selection, scenario)
    return min(rows, key=lambda row: abs(row.change_pct))


def verify_headroom(selection, scenario: str = "BASE") -> bool:
    """Численная проверка аналитики: на границе проходит, чуть за ней — нет."""
    _, metrics = evaluate(selection)
    for row in input_headroom(selection, scenario):
        key = {
            "c0 (стартовые затраты)": "c0_mrub",
            "opex (годовые расходы)": "opex_mrub_per_year",
            "cash (денежные поступления)": "cash_mrub_per_year",
            "vpub (общественная ценность)": "vpub_mrub_per_year",
        }[row.input_name]

        at_edge = dict(metrics)
        at_edge[key] = float(metrics[key]) * row.limit_factor
        if key == "opex_mrub_per_year":
            at_edge["kcash"] = float(metrics["cash_mrub_per_year"]) / at_edge[key]
        if key == "cash_mrub_per_year":
            at_edge["kcash"] = at_edge[key] / float(metrics["opex_mrub_per_year"])
        if not all(r.passed for r in diagnose(at_edge, scenario)):
            return False

        beyond = dict(at_edge)
        step = 1 + 1e-6 if row.direction == "рост" else 1 - 1e-6
        beyond[key] = at_edge[key] * step
        if key == "opex_mrub_per_year":
            beyond["kcash"] = float(metrics["cash_mrub_per_year"]) / beyond[key]
        if key == "cash_mrub_per_year":
            beyond["kcash"] = beyond[key] / float(metrics["opex_mrub_per_year"])
        if all(r.passed for r in diagnose(beyond, scenario)):
            return False  # за границей обязано ломаться
    return True
