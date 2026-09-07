"""Метрика регламента (RMSE -> GapScore) и строгий валидатор submission."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import VEGETATION, CaseConfig


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """RMSE по всем контрольным точкам (формула регламента)."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def gap_score(rmse_value: float, cfg: CaseConfig = VEGETATION) -> float:
    """GapScore = round(score_max * max(0, 1 - RMSE / threshold), 2)."""
    return round(cfg.score_max * max(0.0, 1 - rmse_value / cfg.metric_threshold), 2)


def validate_submission(sub: pd.DataFrame, control_keys: pd.DataFrame,
                        cfg: CaseConfig = VEGETATION) -> None:
    """Строгая проверка формата submission — как на платформе.

    control_keys — DataFrame с колонками cfg.id_col, cfg.date_col (контрольные
    строки). Имена колонок берутся из конфига кейса. ValueError при несоответствии.
    """
    idc, dtc, prc = cfg.id_col, cfg.date_col, cfg.pred_col
    missing = {idc, dtc, prc} - set(sub.columns)
    if missing:
        raise ValueError(f"нет колонок: {sorted(missing)}")
    if sub[prc].isna().any():
        raise ValueError(f"есть NaN в {prc}")
    if not np.isfinite(sub[prc].to_numpy(dtype=float)).all():
        raise ValueError(f"есть inf в {prc}")

    def key(d: pd.DataFrame) -> pd.Series:
        return d[idc].astype(str) + "|" + pd.to_datetime(d[dtc]).dt.strftime("%Y-%m-%d")

    sk, ck = key(sub), key(control_keys)
    if sk.duplicated().any():
        raise ValueError(f"дубликаты ключа {idc}+{dtc} в submission")
    if set(sk) != set(ck):
        extra, lack = set(sk) - set(ck), set(ck) - set(sk)
        raise ValueError(
            f"множество ключей не совпадает с контролем: лишних {len(extra)}, не хватает {len(lack)}"
        )
