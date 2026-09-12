"""Пространство решений: полный перебор, допустимость, Парето-фронт, сравнение.

Это наш слой поверх канонического расчёта. Он ничего не «оптимизирует» скрытно: каждая
конфигурация считается функцией организаторов, а мы лишь перечисляем варианты и отбираем
недоминируемые. Весов здесь нет намеренно — Парето не требует их придумывать
(инструкция кейса прямо предупреждает против «сырые рубли × веса»).
"""

from __future__ import annotations

import itertools
from functools import lru_cache
from typing import Dict, Iterable, List, Sequence, Tuple

import numpy as np
import pandas as pd

from .canonical import Selection, canonical_checks, case_core, evaluate, load_case, lot_ids, mode_ids, scenarios

#: Показатели, которые в Парето-сравнении «чем больше, тем лучше».
MAXIMIZE = ("vpub", "kcash", "t_rep", "readiness", "resilience", "scale")
#: Показатели, которые «чем меньше, тем лучше».
MINIMIZE = ("c0", "opex")

PORTFOLIO_SIZE = 4


def metrics_row(selection: Selection) -> Dict[str, object]:
    """Плоская строка показателей одной конфигурации плюс статусы по сценариям."""
    _, metrics = evaluate(selection)
    row: Dict[str, object] = {
        "lots": "+".join(lot for lot, _ in selection),
        "modes": "".join(mode for _, mode in selection),
        "c0": float(metrics["c0_mrub"]),
        "opex": float(metrics["opex_mrub_per_year"]),
        "vpub": float(metrics["vpub_mrub_per_year"]),
        "cash": float(metrics["cash_mrub_per_year"]),
        "kcash": float(metrics["kcash"]),
        "t_rep": float(metrics["t_rep"]),
        "readiness": float(metrics["readiness_1_5"]),
        "resilience": float(metrics["resilience_1_5"]),
        "scale": float(metrics["scale_1_5"]),
        "territorial_archetypes": int(metrics["territorial_archetypes"]),
        "capability_groups": int(metrics["capability_groups"]),
        "public_core_lots": int(metrics["public_core_lots"]),
    }
    for scenario in scenarios():
        checks = canonical_checks(metrics, scenario=scenario)
        row[f"{scenario}_ok"] = all(checks.values())
        if scenario == "BASE":
            for code, ok in checks.items():
                row[f"chk_{code}"] = ok
    return row


@lru_cache(maxsize=1)
def _enumerate_space() -> pd.DataFrame:
    """Перебирает все сочетания четырёх лотов и все назначения канонических режимов.

    C(8,4) = 70 наборов × 3^4 = 81 назначение = 5670 конфигураций.
    """
    lots, modes, config = load_case()
    pairs = {(lot.lot_id, mode.mode_id): case_core.apply_mode(lot, mode)
             for lot in lots.itertuples() for mode in modes.itertuples()}
    sums = {"c0": "c0_mrub", "opex": "opex_mrub_per_year",
            "vpub": "vpub_mrub_per_year", "cash": "cash_mrub_per_year"}
    means = {"t_rep": "t_rep", "readiness": "readiness_1_5",
             "resilience": "resilience_1_5", "scale": "scale_1_5"}
    rows = []
    for combo in itertools.combinations(lots.lot_id, PORTFOLIO_SIZE):
        for assignment in itertools.product(modes.mode_id, repeat=PORTFOLIO_SIZE):
            # Match the canonical summation order, not the catalog display order.
            detail = [pairs[pair] for pair in sorted(zip(combo, assignment))]
            row = {"lots": "+".join(combo), "modes": "".join(assignment)}
            row.update({key: float(np.array([d[field] for d in detail]).sum()) for key, field in sums.items()})
            row.update({key: float(np.array([d[field] for d in detail]).mean()) for key, field in means.items()})
            row["kcash"] = row["cash"] / row["opex"] if row["opex"] else float("nan")
            row["territorial_archetypes"] = len({d["territorial_archetype"] for d in detail if not d["federal"]})
            row["capability_groups"] = len(set().union(*(
                case_core.normalize_capability(token) for d in detail for token in d["capability_groups"].split(";")
            )))
            row["public_core_lots"] = sum(d["public_core"] for d in detail)
            rows.append(row)
    frame = pd.DataFrame(rows)
    common = config["constraints_common"]
    for scenario, limits in config["scenarios"].items():
        checks = {
            "exact_lot_count": pd.Series(PORTFOLIO_SIZE == common["selected_lots_exactly"], index=frame.index),
            "territorial_archetypes": frame.territorial_archetypes >= common["min_territorial_archetypes"],
            "capability_groups": frame.capability_groups >= common["min_capability_groups"],
            "public_core_lots": frame.public_core_lots >= common["min_public_core_lots"],
            "c0_limit": frame.c0 <= limits["c0_max_mrub"] + 1e-9,
            "opex_limit": frame.opex <= common["opex_max_mrub_per_year"] + 1e-9,
            "vpub_floor": frame.vpub >= common["vpub_min_mrub_per_year"] - 1e-9,
            "kcash_floor": frame.kcash >= common["kcash_min"] - 1e-9,
            "t_rep_floor": frame.t_rep >= common["t_rep_min"] - 1e-9,
        }
        frame[f"{scenario}_ok"] = pd.DataFrame(checks).all(axis=1)
        if scenario == "BASE":
            for code, passed in checks.items():
                frame[f"chk_{code}"] = passed
    return frame


def enumerate_space() -> pd.DataFrame:
    return _enumerate_space().copy(deep=True)


def feasible(scenario: str = "BASE", space: pd.DataFrame = None) -> pd.DataFrame:
    """Конфигурации, проходящие все ограничения указанного сценария."""
    frame = enumerate_space() if space is None else space
    column = f"{scenario}_ok"
    if column not in frame.columns:
        raise ValueError(f"Неизвестный сценарий: {scenario}")
    return frame[frame[column]].reset_index(drop=True)


def pareto_front(
    frame: pd.DataFrame,
    maximize: Sequence[str] = MAXIMIZE,
    minimize: Sequence[str] = MINIMIZE,
) -> pd.DataFrame:
    """Недоминируемые конфигурации.

    Вариант доминируется, если существует другой, который не хуже по всем показателям
    и строго лучше хотя бы по одному.
    """
    if frame.empty:
        return frame.copy()

    highs = frame[list(maximize)].to_numpy()
    lows = frame[list(minimize)].to_numpy()
    keep = []
    for i in range(len(frame)):
        not_worse = (highs >= highs[i]).all(axis=1) & (lows <= lows[i]).all(axis=1)
        strictly_better = (highs > highs[i]).any(axis=1) | (lows < lows[i]).any(axis=1)
        keep.append(not bool((not_worse & strictly_better).any()))
    return frame[keep].reset_index(drop=True)


def binding_analysis(space: pd.DataFrame = None) -> pd.DataFrame:
    """Сколько конфигураций валит каждое ограничение — что реально связывает решение."""
    frame = enumerate_space() if space is None else space
    columns = [c for c in frame.columns if c.startswith("chk_")]
    rows = []
    for column in columns:
        failures = int((~frame[column]).sum())
        rows.append(
            {
                "constraint": column[4:],
                "failures": failures,
                "share": round(100.0 * failures / len(frame), 2),
                "binding": failures > 0,
            }
        )
    return pd.DataFrame(rows).sort_values("failures", ascending=False).reset_index(drop=True)


def lot_frequency(frame: pd.DataFrame) -> pd.DataFrame:
    """Как часто каждый лот встречается в переданном множестве конфигураций."""
    counter: Dict[str, int] = {}
    for value in frame["lots"]:
        for lot in str(value).split("+"):
            counter[lot] = counter.get(lot, 0) + 1
    for lot in lot_ids():
        counter.setdefault(lot, 0)
    return (
        pd.DataFrame({"lot_id": list(counter), "count": list(counter.values())})
        .sort_values("count", ascending=False)
        .reset_index(drop=True)
    )


def parse_selection(text: str) -> List[Tuple[str, str]]:
    """Разбирает запись портфеля вида `FIRE:A,AGRI:A,TRANS:B,ENV:A`."""
    pairs: List[Tuple[str, str]] = []
    for chunk in text.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if ":" not in chunk:
            raise ValueError(f"Ожидался формат ЛОТ:РЕЖИМ, получено: {chunk!r}")
        lot, mode = chunk.split(":", 1)
        pairs.append((lot.strip().upper(), mode.strip().upper()))
    return pairs


def format_selection(selection: Iterable[Tuple[str, str]]) -> str:
    return ",".join(f"{lot}:{mode}" for lot, mode in selection)
