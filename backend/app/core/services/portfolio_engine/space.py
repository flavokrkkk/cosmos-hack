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

import pandas as pd

from .canonical import Selection, canonical_checks, evaluate, lot_ids, mode_ids, scenarios

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
    lots = lot_ids()
    modes = mode_ids()
    rows = []
    for combo in itertools.combinations(lots, PORTFOLIO_SIZE):
        for assignment in itertools.product(modes, repeat=PORTFOLIO_SIZE):
            rows.append(metrics_row(list(zip(combo, assignment))))
    return pd.DataFrame(rows)


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
