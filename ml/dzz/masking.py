"""Воспроизведение маски организаторов — основа честной локальной проверки.

Любой «Метрика»-кейс прячет часть строк как контрольные и оценивает RMSE на них.
Чтобы локальная оценка была достижимой (а не фантомной из-за утечки), мы прячем
известные наблюдения по тому же профилю и оцениваем только на них.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Профиль длин серий пропусков из отчёта Ростова: ~85% серий длины 1, дальше спад.
GAP_RUN_PROFILE = {1: 0.851, 2: 0.116, 3: 0.020, 4: 0.008, 5: 0.005}


def make_synthetic_gaps(df: pd.DataFrame, frac: float = 0.15, seed: int = 99) -> np.ndarray:
    """Помечает часть известных наблюдений как контрольные (synthetic gap).

    Возвращает булев массив длины len(df): True — строка «спрятана». Повторяет
    профиль организаторов: серии подряд идущих наблюдений, в основном длины 1, и
    не трогает самые края ряда полигона (нужен известный сосед с двух сторон).
    """
    rng = np.random.default_rng(seed)
    lengths = np.array(list(GAP_RUN_PROFILE))
    probs = np.array(list(GAP_RUN_PROFILE.values()))
    probs = probs / probs.sum()

    hidden = np.zeros(len(df), dtype=bool)
    known = df["target"].notna().to_numpy()
    for _, idx in df.groupby("anon_polygon_id").groups.items():
        pos = np.array(idx)
        kpos = pos[known[pos]]
        if len(kpos) < 8:
            continue
        target = int(len(kpos) * frac)
        placed = 0
        guard = 0
        while placed < target and guard < target * 20:
            guard += 1
            run = int(rng.choice(lengths, p=probs))
            # старт не на самом краю: оставляем известного соседа слева и справа
            start = int(rng.integers(1, max(2, len(kpos) - run - 1)))
            block = kpos[start : start + run]
            if len(block) < run or hidden[block].any():
                continue
            hidden[block] = True
            placed += len(block)
    return hidden
