from dataclasses import dataclass, replace

import pandas as pd

from app.core.dto.portfolio import (
    DecisionAnalysis, MethodDefinition, MethodOutcome, RankingCriterion, RecommendRequest,
    ScoreComponent, SelectionItem, SensitivityCase, SensitivityOutcome,
)
from app.core.services.portfolio_engine import canonical, space


CRITERIA = [RankingCriterion(key=key, title=title, direction=direction) for key, title, direction in (
    ("vpub", "Общественная ценность", "max"), ("c0", "Затраты на запуск", "min"),
    ("opex", "Ежегодные расходы", "min"), ("kcash", "Покрытие расходов поступлениями", "max"),
    ("t_rep", "Индекс t_rep", "max"), ("readiness", "Готовность", "max"),
    ("resilience", "Индекс устойчивости из данных кейса", "max"), ("scale", "Тиражируемость", "max"),
)]
METHODS = [
    MethodDefinition(id="cash_surplus_v1", title="Максимум годового денежного остатка",
                     priorities=["Обязательные условия кейса", "Явно заданные дополнительные условия",
                                 "Максимум CASH − OPEX", "При равенстве: VPUB, C0 и остальные показатели"],
                     description="Максимизируем годовые поступления минус ежегодные расходы среди допустимых вариантов. "
                     "Остальные критерии защищены заданными требованиями; это не максимум по всем показателям одновременно. "
                     "Сравнение и чувствительность показывают цену такого приоритета."),
    MethodDefinition(id="weighted_mcda_v1", title="Взвешенное сравнение восьми показателей",
                     priorities=["Та же допустимая область", "Min–max нормирование восьми показателей",
                                 "Максимум суммы нормированных значений с весами",
                                 "При равном балле: годовой остаток, VPUB, C0 и остальные показатели"],
                     description="Дополнительный способ сравнения. Равные веса — исходное допущение, а не объективная важность. "
                     "В ответе видны веса, шкалы и вклад каждого показателя. Официальные формулы не меняются."),
]
METHOD_IDS = [method.id for method in METHODS]
PARETO_MAXIMIZE = (*space.MAXIMIZE, "surplus")
TIE_COLUMNS = ["surplus", "vpub", "c0", "opex", "kcash", "t_rep", "readiness", "resilience", "scale", "stable_id"]
TIE_ASCENDING = [False, False, True, True, False, False, False, False, False, True]


@dataclass(frozen=True)
class Conditions:
    budget: float
    vpub_floor: float
    public_lots: tuple[str, ...]
    cash_multiplier: float = 1
    opex_multiplier: float = 1


def normalize_weights(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values())
    return {key: value / total for key, value in weights.items()}


def candidate_frame(request: RecommendRequest) -> pd.DataFrame:
    frame = space.enumerate_space()
    if request.lot_ids is not None:
        frame = frame[frame.lots.map(lambda value: set(value.split("+")).issubset(request.lot_ids))].copy()
    frame["stable_id"] = [space.format_selection(sorted(zip(row.lots.split("+"), row.modes)))
                          for row in frame.itertuples()]
    _, modes, _ = canonical.load_case()
    public_modes = set(modes.loc[modes.public_core, "mode_id"])
    frame["public_lot_ids"] = [frozenset(lot for lot, mode in zip(row.lots.split("+"), row.modes) if mode in public_modes)
                              for row in frame.itertuples()]
    frame["surplus"] = frame.cash - frame.opex
    return frame


def apply_conditions(frame: pd.DataFrame, conditions: Conditions, require_stress: bool) -> pd.DataFrame:
    _, _, config = canonical.load_case()
    common = config["constraints_common"]
    result = frame[frame.BASE_ok & (frame.STRESS_ok if require_stress else True)].copy()
    result["cash"] *= conditions.cash_multiplier
    result["opex"] *= conditions.opex_multiplier
    result["kcash"] = result.cash / result.opex
    result["surplus"] = result.cash - result.opex
    return result[
        (result.c0 <= conditions.budget + 1e-9)
        & (result.vpub >= conditions.vpub_floor - 1e-9)
        & (result.opex <= common["opex_max_mrub_per_year"] + 1e-9)
        & (result.kcash >= common["kcash_min"] - 1e-9)
        & result.public_lot_ids.map(lambda ids: set(conditions.public_lots).issubset(ids)).astype(bool)
    ].copy()


def score_frame(frame: pd.DataFrame, weights: dict[str, float], bounds: dict[str, tuple[float, float]]) -> pd.DataFrame:
    scored = frame.copy()
    scored["score"] = 0.0
    for criterion in CRITERIA:
        low, high = bounds[criterion.key]
        if high == low:
            value = pd.Series(1.0, index=scored.index)
        else:
            value = (scored[criterion.key] - low) / (high - low)
            if criterion.direction == "min":
                value = 1 - value
        scored[f"normalized_{criterion.key}"] = value
        scored["score"] += value * weights[criterion.key]
    return scored


def winners(frame: pd.DataFrame, weights: dict[str, float], bounds: dict[str, tuple[float, float]]) -> dict[str, MethodOutcome]:
    if frame.empty:
        return {}
    scored = score_frame(frame, weights, bounds)
    outcomes = {}
    for method in METHOD_IDS:
        columns = (["score"] if method == "weighted_mcda_v1" else []) + TIE_COLUMNS
        ascending = ([False] if method == "weighted_mcda_v1" else []) + TIE_ASCENDING
        row = scored.sort_values(columns, ascending=ascending, kind="stable").iloc[0]
        weighted = method == "weighted_mcda_v1"
        outcomes[method] = MethodOutcome(
            method_id=method, selection_id=row.stable_id,
            selection=[SelectionItem(lot_id=lot, mode_id=mode) for lot, mode in space.parse_selection(row.stable_id)],
            c0_mrub=row.c0, vpub_mrub_per_year=row.vpub, annual_surplus_mrub=row.surplus, kcash=row.kcash,
            score=row.score if weighted else None,
            components=[ScoreComponent(**criterion.model_dump(), raw=row[criterion.key],
                                       minimum=bounds[criterion.key][0], maximum=bounds[criterion.key][1],
                                       normalized=row[f"normalized_{criterion.key}"], weight=weights[criterion.key],
                                       contribution=row[f"normalized_{criterion.key}"] * weights[criterion.key])
                        for criterion in CRITERIA] if weighted else [],
        )
    return outcomes


def analyze(request: RecommendRequest) -> tuple[pd.DataFrame, pd.DataFrame, DecisionAnalysis]:
    frame = candidate_frame(request)
    _, _, config = canonical.load_case()
    scenario = "STRESS" if request.require_stress else "BASE"
    official_budget = min(config["scenarios"][key]["c0_max_mrub"] for key in ("BASE", scenario))
    conditions = Conditions(
        budget=min(official_budget, request.budget_cap_mrub or official_budget),
        vpub_floor=max(config["constraints_common"]["vpub_min_mrub_per_year"], request.vpub_floor_mrub_per_year or 0),
        public_lots=tuple(request.required_public_lot_ids),
    )
    candidates = apply_conditions(frame, conditions, request.require_stress)
    weights = normalize_weights(request.weights.model_dump())
    analysis = DecisionAnalysis(normalized_weights=weights, methods=[], sensitivity=[],
                                pareto_objectives=[*PARETO_MAXIMIZE, *space.MINIMIZE])
    if candidates.empty:
        return frame, candidates, analysis
    bounds = {criterion.key: (float(candidates[criterion.key].min()), float(candidates[criterion.key].max()))
              for criterion in CRITERIA}
    baseline = winners(candidates, weights, bounds)
    analysis.methods = list(baseline.values())
    cases = []
    for pct in (1, 5, 10):
        cases.append((f"budget_{pct}", f"Лимит запуска ниже на {pct}%", replace(conditions, budget=conditions.budget * (1 - pct / 100)), weights))
    for pct in (10, 20):
        cases.append((f"vpub_{pct}", f"Минимум общественной ценности выше на {pct}%", replace(conditions, vpub_floor=conditions.vpub_floor * (1 + pct / 100)), weights))
    for lot in request.lot_ids or canonical.lot_ids():
        if lot not in conditions.public_lots:
            cases.append((f"public_{lot}", f"Сохранить {lot} в общественном ядре",
                          replace(conditions, public_lots=tuple(sorted((*conditions.public_lots, lot)))), weights))
    for name, title, cash, opex in (
        ("cash_drop", "Поступления ниже на 10%", .9, 1),
        ("opex_growth", "Расходы выше на 5%", 1, 1.05),
        ("combined", "Поступления −10%, расходы +5%", .9, 1.05),
    ):
        cases.append((name, title, replace(conditions, cash_multiplier=cash, opex_multiplier=opex), weights))
    for criterion in CRITERIA:
        for multiplier in (.8, 1.2):
            changed = dict(weights)
            changed[criterion.key] *= multiplier
            cases.append((f"weight_{criterion.key}_{multiplier}", f"Вес «{criterion.title}» {'−' if multiplier < 1 else '+'}20%",
                          conditions, normalize_weights(changed)))
    for name, title, changed_conditions, changed_weights in cases:
        changed_frame = apply_conditions(frame, changed_conditions, request.require_stress)
        selected = winners(changed_frame, changed_weights, bounds)
        outcomes = {}
        for method, original in baseline.items():
            row = frame[frame.stable_id == original.selection_id].iloc[0]
            winner = selected.get(method)
            outcomes[method] = SensitivityOutcome(
                winner=winner, winner_changed=winner is None or winner.selection_id != original.selection_id,
                original_still_feasible=bool((changed_frame.stable_id == original.selection_id).any()),
                original_adjusted_surplus_mrub=row.cash * changed_conditions.cash_multiplier - row.opex * changed_conditions.opex_multiplier,
            )
        analysis.sensitivity.append(SensitivityCase(
            id=name, title=title, budget_cap_mrub=changed_conditions.budget,
            vpub_floor_mrub_per_year=changed_conditions.vpub_floor, required_public_lot_ids=list(changed_conditions.public_lots),
            cash_multiplier=changed_conditions.cash_multiplier, opex_multiplier=changed_conditions.opex_multiplier,
            weights=changed_weights, feasible_count=len(changed_frame), outcomes=outcomes,
        ))
    return frame, candidates, analysis
