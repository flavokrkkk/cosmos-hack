"""Единственный метод выбора: maximin → денежный остаток, с явным пределом Δ.

Шкалы фиксируются по всей официально допустимой области выбранного сценария,
до фильтра состава, дополнительных требований и Δ. ε качества равен нулю.
Автоматический Δ описывает цену достижения Qmax, ручной ограничивает поиск.
Округление агрегатов до 8 знаков убирает машинный шум; ручной Δ не округляется.
Дополнительные сценарии считаются после выбора и не меняют основную рекомендацию.
"""
from dataclasses import dataclass, field
from fractions import Fraction
import math

import pandas as pd

from . import canonical, space

METHOD_ID = "hybrid_maximin_v1"
CRITERIA = (
    ("vpub", "Общественная ценность", "max"),
    ("surplus", "Годовой денежный остаток", "max"),
    ("c0", "Затраты на запуск", "min"),
    ("readiness", "Готовность", "max"),
    ("resilience", "Индекс устойчивости из данных кейса", "max"),
    ("scale", "Тиражируемость", "max"),
)
MAXIMIZE = tuple(key for key, _, direction in CRITERIA if direction == "max")
MINIMIZE = ("c0",)
NORMALIZATION = (
    "Min–max по всем официально допустимым портфелям выбранного сценария, до ограничения "
    "состава, дополнительных условий и Δ. Эти границы фиксированы для чувствительности. "
    "Постоянный критерий получает 1. Q — минимум шести оценок; ε = 0. "
    "При равенстве Q выбирается максимум S, затем сумма оценок, затем стабильный ID."
)
CAVEAT = (
    "Шкалы и порядок выбора — предпочтения команды. Автоматический Δ — вычисленная цена "
    "достижения максимума Q, а не независимый денежный лимит. Ручной Δ ограничивает потерю S. "
    "Q — относительная оценка слабейшего критерия, не процент выполнения общественной задачи; "
    "равный Q не означает равенства остальных показателей. Min–max усиливает небольшие различия "
    "индексов. Дополнительные сценарии — иллюстрации, не вероятности; они не влияют на основного "
    "победителя и не заменяют официальный STRESS. "
    "S не учитывает возврат C0, налоги и стоимость капитала и не является чистой прибылью."
)


def exact(value) -> Fraction:
    return Fraction(str(round(float(value), 8)))


@dataclass(frozen=True)
class Parameters:
    inputs: dict | None = None
    cash_loss_limit_mrub: float | None = None
    require_stress: bool = True
    budget_cap_mrub: float | None = None
    vpub_floor_mrub_per_year: float | None = None
    required_public_lot_ids: tuple[str, ...] = ()
    lot_ids: tuple[str, ...] | None = None
    allowed_modes_by_lot: dict[str, list[str]] = field(default_factory=dict)
    quality_epsilon: float = 0

    def __post_init__(self):
        if not isinstance(self.require_stress, bool):
            raise ValueError("require_stress должен быть логическим значением")
        if isinstance(self.cash_loss_limit_mrub, bool):
            raise ValueError("Δ должен быть числом, не логическим значением")
        if self.cash_loss_limit_mrub is not None and (not math.isfinite(self.cash_loss_limit_mrub) or self.cash_loss_limit_mrub < 0):
            raise ValueError("Δ должен быть конечным неотрицательным числом")
        if self.quality_epsilon != 0:
            raise ValueError("В принятой версии ε качества равен 0")
        for value, positive in ((self.budget_cap_mrub, True), (self.vpub_floor_mrub_per_year, False)):
            if value is not None and (isinstance(value, bool) or not math.isfinite(value) or value < 0 or (positive and value == 0)):
                raise ValueError("Некорректный дополнительный порог")
        known = set(canonical.lot_ids(self.inputs))
        if not set(self.allowed_modes_by_lot) <= known:
            raise ValueError("Неизвестные лоты в разрешённых режимах")
        if any(not set(modes) <= {"A", "B", "C"} for modes in self.allowed_modes_by_lot.values()):
            raise ValueError("Неизвестные режимы")
        for ids in (self.lot_ids, self.required_public_lot_ids):
            if ids is not None and (len(set(ids)) != len(ids) or not set(ids) <= known):
                raise ValueError("Повторяющиеся или неизвестные лоты")
        if self.lot_ids is not None and not 4 <= len(self.lot_ids) <= len(known):
            raise ValueError("В области поиска должно быть от 4 до 8 лотов")
        if len(self.required_public_lot_ids) > 4 or (self.lot_ids is not None and not set(self.required_public_lot_ids) <= set(self.lot_ids)):
            raise ValueError("Обязательное ядро должно входить в область поиска и содержать не более 4 лотов")


def candidate_frame(inputs: dict | None = None) -> pd.DataFrame:
    frame = space.enumerate_space(inputs)
    frame["stable_id"] = [space.format_selection(sorted(zip(row.lots.split("+"), row.modes))) for row in frame.itertuples()]
    _, modes, _ = canonical.load_case(inputs)
    public_modes = set(modes.loc[modes.public_core, "mode_id"])
    frame["public_lot_ids"] = [frozenset(lot for lot, mode in zip(row.lots.split("+"), row.modes) if mode in public_modes) for row in frame.itertuples()]
    frame["surplus"] = frame.cash - frame.opex
    return frame


def conditions(parameters: Parameters) -> dict:
    _, _, config = canonical.load_case()
    scenario = "STRESS" if parameters.require_stress else "BASE"
    budget = min(config["scenarios"][s]["c0_max_mrub"] for s in ("BASE", scenario))
    return dict(budget_cap_mrub=min(budget, parameters.budget_cap_mrub or budget),
                vpub_floor_mrub_per_year=max(config["constraints_common"]["vpub_min_mrub_per_year"], parameters.vpub_floor_mrub_per_year or 0),
                required_public_lot_ids=list(parameters.required_public_lot_ids), cash_multiplier=1., opex_multiplier=1.)


def apply_conditions(frame: pd.DataFrame, limits: dict) -> pd.DataFrame:
    """frame уже прошёл официальные BASE/STRESS; шоки применяются независимо."""
    common = canonical.load_case()[2]["constraints_common"]
    result = frame.copy()
    result["cash"] *= limits["cash_multiplier"]
    result["opex"] *= limits["opex_multiplier"]
    result["kcash"] = result.cash / result.opex
    result["surplus"] = result.cash - result.opex
    return result[(result.c0 <= limits["budget_cap_mrub"] + 1e-9)
                  & (result.vpub >= limits["vpub_floor_mrub_per_year"] - 1e-9)
                  & (result.opex <= common["opex_max_mrub_per_year"] + 1e-9)
                  & (result.kcash >= common["kcash_min"] - 1e-9)
                  & result.public_lot_ids.map(lambda ids: set(limits["required_public_lot_ids"]).issubset(ids)).astype(bool)].copy()


def score_frame(frame: pd.DataFrame, bounds: dict) -> pd.DataFrame:
    result = frame.copy()
    columns = []
    for key, _, direction in CRITERIA:
        low, high = map(exact, bounds[key])
        values = result[key].map(exact)
        normalized = values.map(lambda value: Fraction(1) if high == low else
                                (high - value if direction == "min" else value - low) / (high - low))
        column = f"normalized_{key}"
        result[column] = normalized
        columns.append(column)
    result["q_exact"] = [min(values) for values in result[columns].itertuples(index=False, name=None)]
    result["sum_exact"] = [sum(values) for values in result[columns].itertuples(index=False, name=None)]
    result["surplus_exact"] = result.surplus.map(exact)
    return result


def select(scored: pd.DataFrame, delta: float | None) -> tuple[pd.Series | None, dict]:
    """Выбор по принятому правилу. Вход не содержит результатов чувствительности."""
    if scored.empty:
        return None, dict(s_max_mrub=None, cash_floor_mrub=None, cash_eligible_count=0, q_max=None, effective_delta_mrub=None, max_q_count=0)
    s_max = max(scored.surplus_exact)
    priorities = ["q_exact", "surplus_exact", "sum_exact", "stable_id"]
    ascending = [False, False, False, True]
    if delta is None:
        # Сначала Q → S. Автоматический Δ — следствие этого выбора, не новая гипотеза.
        row = scored.sort_values(priorities, ascending=ascending, kind="stable").iloc[0]
        cash_floor = row.surplus_exact
        delta_exact = s_max - cash_floor
        eligible = scored[scored.surplus_exact >= cash_floor]
    else:
        # Округляется шум агрегатов, но не явный предел пользователя: 9.499999999 < 9.5.
        delta_exact = Fraction(str(delta))
        cash_floor = s_max - delta_exact
        eligible = scored[scored.surplus_exact >= cash_floor]
        row = eligible.sort_values(priorities, ascending=ascending, kind="stable").iloc[0]
    quality_pool = scored if delta is None else eligible
    return row, dict(max_q_count=int((quality_pool.q_exact == row.q_exact).sum()), s_max_mrub=float(s_max), cash_floor_mrub=float(cash_floor),
                     cash_eligible_count=len(eligible), q_max=float(row.q_exact), effective_delta_mrub=float(delta_exact))


def outcome(row: pd.Series | None, bounds: dict) -> dict | None:
    if row is None:
        return None
    return dict(method_id=METHOD_ID, selection_id=row.stable_id,
                selection=[dict(lot_id=lot, mode_id=mode) for lot, mode in space.parse_selection(row.stable_id)],
                c0_mrub=float(row.c0), vpub_mrub_per_year=float(row.vpub),
                annual_surplus_mrub=float(row.surplus), kcash=float(row.kcash),
                q=float(row.q_exact), q_exact=str(row.q_exact),
                components=[dict(key=key, title=title, direction=direction, raw=float(row[key]),
                                 minimum=bounds[key][0], maximum=bounds[key][1],
                                 normalized=float(row[f"normalized_{key}"]),
                                 bottleneck=row[f"normalized_{key}"] == row.q_exact)
                            for key, title, direction in CRITERIA])


def switching_curve(scored: pd.DataFrame, bounds: dict) -> list[dict]:
    if scored.empty:
        return []
    s_max = max(scored.surplus_exact)
    switches = []
    for delta in sorted({s_max - s for s in scored.surplus_exact}):
        row, _ = select(scored, float(delta))
        if not switches or row.stable_id != switches[-1]["winner"]["selection_id"]:
            if switches:
                switches[-1]["delta_to_exclusive_mrub"] = float(delta)
            switches.append(dict(delta_from_mrub=float(delta), delta_to_exclusive_mrub=None, winner=outcome(row, bounds)))
    return switches


def sensitivity_scenarios(limits: dict, parameters: Parameters) -> list[tuple[str, str, dict]]:
    """Иллюстративные условия для отдельных проверок; не входы основного поиска."""
    cases = []
    for pct in (1, 5, 10):
        cases.append((f"budget_{pct}", f"Лимит запуска ниже на {pct}%", dict(limits, budget_cap_mrub=limits["budget_cap_mrub"] * (1-pct/100))))
    for pct in (10, 20):
        cases.append((f"vpub_{pct}", f"Минимум общественной ценности выше на {pct}%", dict(limits, vpub_floor_mrub_per_year=limits["vpub_floor_mrub_per_year"] * (1+pct/100))))
    for lot in parameters.lot_ids or canonical.lot_ids(parameters.inputs):
        if lot not in parameters.required_public_lot_ids and len(parameters.required_public_lot_ids) < 4:
            cases.append((f"public_{lot}", f"Сохранить {lot} в общественном ядре", dict(limits, required_public_lot_ids=sorted((*parameters.required_public_lot_ids, lot)))))
    for name, title, cash, opex in (("cash_drop", "Поступления ниже на 10%", .9, 1),
                                   ("opex_growth", "Расходы выше на 5%", 1, 1.05),
                                   ("combined", "Поступления −10%, расходы +5%", .9, 1.05)):
        cases.append((name, title, dict(limits, cash_multiplier=cash, opex_multiplier=opex)))
    return cases


def analyze_sensitivity(official: pd.DataFrame, limits: dict, parameters: Parameters,
                        bounds: dict, original: pd.Series) -> list[dict]:
    """Сравнивает отдельные сценарии с уже выбранным портфелем, сохраняя его входы."""
    results = []
    for name, title, changed in sensitivity_scenarios(limits, parameters):
        pool = apply_conditions(official, changed)
        selected, stage = select(score_frame(pool, bounds), parameters.cash_loss_limit_mrub)
        results.append(dict(id=name, title=title, origin="допущение", **changed, **stage,
            feasible_count=len(pool), outcome=dict(winner=outcome(selected, bounds),
            winner_changed=selected is None or selected.stable_id != original.stable_id,
            original_still_feasible=bool((pool.stable_id == original.stable_id).any()),
            original_adjusted_surplus_mrub=float(original.cash * changed["cash_multiplier"] - original.opex * changed["opex_multiplier"]))))
    return results


def analyze(parameters: Parameters, *, include_sensitivity: bool = True) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    all_rows = candidate_frame(parameters.inputs) if parameters.inputs is not None else candidate_frame()
    reference = all_rows[all_rows.BASE_ok & (all_rows.STRESS_ok if parameters.require_stress else True)]
    bounds = {key: (float(reference[key].min()), float(reference[key].max())) for key, _, _ in CRITERIA} if not reference.empty else {}
    frame = all_rows
    if parameters.lot_ids is not None:
        frame = frame[frame.lots.map(lambda value: set(value.split("+")).issubset(parameters.lot_ids))].copy()
    if parameters.allowed_modes_by_lot:
        frame = frame[frame.stable_id.map(lambda value: all(
            not parameters.allowed_modes_by_lot.get(lot) or mode in parameters.allowed_modes_by_lot[lot]
            for lot, mode in space.parse_selection(value)
        )).astype(bool)].copy()
    official = frame[frame.BASE_ok & (frame.STRESS_ok if parameters.require_stress else True)]
    limits = conditions(parameters)
    candidates = apply_conditions(official, limits)
    scored = score_frame(candidates, bounds) if bounds else candidates
    row, stages = select(scored, parameters.cash_loss_limit_mrub)
    analysis = dict(winner=outcome(row, bounds), **stages, cash_loss_limit_mrub=parameters.cash_loss_limit_mrub,
                    quality_epsilon=0, reference_count=len(reference), bounds=bounds, sensitivity=[],
                    feasible_count=len(candidates),
                    switching_curve=switching_curve(scored, bounds), pareto_objectives=[*MAXIMIZE, *MINIMIZE],
                    normalization=NORMALIZATION, caveat=CAVEAT)
    # Диагностика выполняется после основного решения и записывает только свой раздел.
    if row is not None and include_sensitivity:
        analysis["sensitivity"] = analyze_sensitivity(official, limits, parameters, bounds, row)
    return frame, candidates, analysis
