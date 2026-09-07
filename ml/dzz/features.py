"""Leak-free признаки и их вспомогательные функции.

Все признаки считаются из даты, объекта и СОСЕДНИХ видимых наблюдений — но
никогда из значений самой контрольной строки (на ней всё динамическое скрыто).
Это то, что отделяет достижимую метрику от фантомной.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import VEGETATION, CaseConfig


def known_series(g: pd.DataFrame, visible: np.ndarray):
    """(дни-от-начала, значения, сенсоры, дни-всех-строк) для видимых наблюдений."""
    m = visible & g["target"].notna().to_numpy()
    day = (g["date"] - g["date"].min()).dt.days.to_numpy()
    return day[m], g["target"].to_numpy()[m], g["sensor"].to_numpy()[m], day


def gauss_smooth(kday, kval, t, bw):
    """Гауссово сглаживание ряда в точке t с полушириной bw (окно ±3*bw)."""
    w = np.exp(-0.5 * ((kday - t) / bw) ** 2)
    w[np.abs(kday - t) > 3 * bw] = 0.0
    s = w.sum()
    return float((w * kval).sum() / s) if s > 1e-9 else np.nan


def source_probabilities(df: pd.DataFrame, visible: np.ndarray):
    """Функция doy -> {источник: вероятность}: каким сенсором обычно снят этот день.

    Оценивается по видимым наблюдениям — это можно знать без самой строки.
    """
    m = visible & df["target"].notna().to_numpy()
    sub = df.loc[m, ["doy", "sensor"]]
    prob_by_doy: dict[int, dict[str, float]] = {}
    for doy, grp in sub.groupby("doy"):
        prob_by_doy[int(doy)] = {s: float(w) for s, w in grp["sensor"].value_counts(normalize=True).items()}
    overall = {s: float(w) for s, w in sub["sensor"].value_counts(normalize=True).items()}
    return lambda doy: prob_by_doy.get(int(doy), overall)


def neighbor_features(df: pd.DataFrame, visible: np.ndarray, targets: np.ndarray) -> pd.DataFrame:
    """Признаки соседей и окна — всё из ВИДИМЫХ наблюдений, без самой строки."""
    rows = {}
    for _, idx in df.groupby("anon_polygon_id").groups.items():
        pos = np.array(idx)
        g = df.loc[pos]
        kday, kval, _ksrc, day = known_series(g, visible[pos])
        for j, p in enumerate(pos):
            if not targets[p]:
                continue
            t = day[j]
            left, right = kday < t, kday > t
            lv = kval[left][-1] if left.any() else np.nan
            rv = kval[right][0] if right.any() else np.nan
            win = np.abs(kday - t) <= 30
            rows[p] = {
                "nb_left": lv,
                "nb_right": rv,
                "nb_left_dist": (t - kday[left][-1]) if left.any() else np.nan,
                "nb_right_dist": (kday[right][0] - t) if right.any() else np.nan,
                "nb_mean": np.nanmean([lv, rv]) if np.isfinite([lv, rv]).any() else np.nan,
                "win_n": int(win.sum()),
                "win_mean": float(np.mean(kval[win])) if win.any() else np.nan,
                "win_std": float(np.std(kval[win])) if win.sum() > 1 else 0.0,
            }
    return pd.DataFrame.from_dict(rows, orient="index")


def feature_frame(df, visible, targets, anchor_pred, src_prob, cfg: CaseConfig = VEGETATION):
    """Матрица признаков для строк targets (индекс — позиция в df). Leak-free."""
    nb = neighbor_features(df, visible, targets)
    idx = nb.index.to_numpy()
    sub = df.loc[idx]
    feat = nb.copy()
    feat["anchor"] = anchor_pred[idx]
    feat["doy"] = sub["doy"].to_numpy()
    feat["year"] = sub["year"].to_numpy()
    # статический категориальный признак (если задан в конфиге и есть в данных)
    if cfg.static_cat_col and cfg.static_cat_col in df.columns and cfg.cat_dict is not None:
        feat["cat"] = sub[cfg.static_cat_col].map(cfg.cat_dict).fillna(len(cfg.cat_dict)).to_numpy()
    # вероятность источника по календарю (по одному признаку на источник)
    if cfg.source_cols:
        probs = [src_prob(d) for d in sub["doy"]]
        for _c, name in cfg.source_cols:
            feat[f"p_{name}"] = [p.get(name, 0.0) for p in probs]
    return feat, idx
