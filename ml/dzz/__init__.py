"""dzz — generic-ядро под ДЗЗ-кейс с метрикой (восстановление ряда + аномалии).

Пайплайн тема-независим: тему знает только CaseConfig (config.py), а логика
работает с каноническими колонками (anon_polygon_id, date, target, sensor),
которые расставляет data.prepare(). Под новый кейс правишь один config.

Типовой поток:
    import dzz
    df = dzz.prepare(pd.read_csv(path), dzz.VEGETATION)
    hidden = dzz.make_synthetic_gaps(df)                 # честная маска
    visible = df["target"].notna().to_numpy() & ~hidden
    pred = dzz.reconstruct_model_ensemble(df, visible, hidden)
    score = dzz.gap_score(dzz.rmse(df["target"][hidden], pred[hidden]))
"""

from __future__ import annotations

from .anomalies import detect_anomalies, seasonal_z
from .config import TEMPLATE, VEGETATION, CaseConfig
from .data import prepare, sensor_of
from .masking import make_synthetic_gaps
from .metrics import gap_score, rmse, validate_submission
from .reconstruct import (
    reconstruct_anchor,
    reconstruct_baseline,
    reconstruct_model,
    reconstruct_model_ensemble,
)

__all__ = [
    "CaseConfig", "VEGETATION", "TEMPLATE",
    "prepare", "sensor_of",
    "rmse", "gap_score", "validate_submission",
    "make_synthetic_gaps",
    "reconstruct_baseline", "reconstruct_anchor",
    "reconstruct_model", "reconstruct_model_ensemble",
    "seasonal_z", "detect_anomalies",
]
