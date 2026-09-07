"""Загрузка и канонизация данных кейса.

`prepare()` приводит колонки любой ДЗЗ-задачи к КАНОНИЧЕСКИМ именам, с которыми
работает весь остальной пакет:

* ``anon_polygon_id`` — идентификатор объекта;
* ``date``, ``year``, ``doy`` — календарь (пересчитываются из даты);
* ``target`` — восстанавливаемая величина (цель метрики);
* ``sensor`` — источник наблюдения (для тем со смесью сенсоров), иначе ``"na"``.

Так код признаков/восстановления не зависит от предметной темы: тему знает только
CaseConfig, а не логика.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import VEGETATION, CaseConfig

# Порядок приоритета сенсоров по умолчанию (вегетация); переопределяется конфигом.
SENSOR_COLS = [("s2_ndvi", "s2"), ("landsat_ndvi", "landsat"), ("modis_ndvi", "modis")]


def sensor_of(row: pd.Series, source_cols=SENSOR_COLS) -> str | float:
    """Источник цели по правилу «первый непустой» из source_cols."""
    for col, name in source_cols:
        if pd.notna(row.get(col)):
            return name
    return np.nan


def prepare(df: pd.DataFrame, cfg: CaseConfig = VEGETATION) -> pd.DataFrame:
    """Приводит колонки кейса к каноническим именам и заполняет календарь/источник."""
    out = df.copy()
    out["anon_polygon_id"] = out[cfg.id_col]
    out["date"] = pd.to_datetime(out[cfg.date_col])
    out["year"] = out["date"].dt.year
    out["doy"] = out["date"].dt.dayofyear
    out["target"] = out[cfg.target_col] if cfg.target_col in out.columns else np.nan
    # источник наблюдения: смесь сенсоров -> правило «первый непустой»; иначе единый
    if cfg.source_cols:
        out["sensor"] = out.apply(lambda r: sensor_of(r, cfg.source_cols), axis=1)
    else:
        # object-массив: строка "na" на известных строках, None на пустых
        # (np.where со смешением str/float падает на numpy 2.x)
        sensor = np.full(len(out), None, dtype=object)
        sensor[out["target"].notna().to_numpy()] = "na"
        out["sensor"] = sensor
    return out.sort_values(["anon_polygon_id", "date"]).reset_index(drop=True)
