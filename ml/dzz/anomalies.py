"""Детекция негативных аномалий (Задача 2) — тема-независимо.

Метод регламента: z-score относительно сезонной климатической нормы того же
объекта в ту же фазу сезона. Пороги: z >= -1 норма, -2 <= z < -1 угнетение,
z < -2 критично. Периоды короче min_run_days не считаются аномалией.

Работает с любым индексом (NDVI, влажность, уровень воды…): нужен подготовленный
df с каноническими anon_polygon_id, date, year, doy и колонкой значения (target).
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def seasonal_z(df: pd.DataFrame, value_col: str = "target",
               window: int = 7, min_std: float = 0.02) -> pd.DataFrame:
    """Добавляет clim_mean, clim_std, z: отклонение от нормы того же дня сезона.

    Норма — по наблюдениям того же объекта в окне ±window дней сезона (по всем
    годам). Переносимо: климатология организаторов не требуется.
    """
    out = df.copy()
    out["clim_mean"] = np.nan
    out["clim_std"] = np.nan
    out["z"] = np.nan
    doy_index = pd.Index(range(1, 367), name="doy")
    for _pid, g in out.groupby("anon_polygon_id"):
        by = g.groupby("doy")[value_col]
        s = by.sum().reindex(doy_index, fill_value=0.0)
        c = by.count().reindex(doy_index, fill_value=0)
        q = g.assign(sq=g[value_col] ** 2).groupby("doy")["sq"].sum().reindex(doy_index, fill_value=0.0)
        win = 2 * window + 1
        S = s.rolling(win, center=True, min_periods=1).sum()
        C = c.rolling(win, center=True, min_periods=1).sum()
        Q = q.rolling(win, center=True, min_periods=1).sum()
        mean = S / C.replace(0, np.nan)
        std = np.sqrt(((Q / C.replace(0, np.nan)) - mean ** 2).clip(lower=0)).clip(lower=min_std)
        m, sd = g["doy"].map(mean), g["doy"].map(std)
        out.loc[g.index, "clim_mean"] = m.to_numpy()
        out.loc[g.index, "clim_std"] = sd.to_numpy()
        out.loc[g.index, "z"] = ((g[value_col] - m) / sd).to_numpy()
    return out


def detect_anomalies(df_z: pd.DataFrame, restored_mask: np.ndarray | None = None,
                     min_run_days: int = 5, min_ref_years: int = 3,
                     max_gap_days: int = 21,
                     context_cols: tuple[str, ...] = ()) -> list[dict]:
    """Находит негативные аномальные периоды (подряд z < -1, длиной >= min_run_days).

    restored_mask — какие строки восстановлены моделью (True). Период только из
    восстановленных получает статус candidate, иначе confirmed; при < min_ref_years
    опорных сезонов — insufficient_data (не выдумываем норму). Серия рвётся на
    разрыве > max_gap_days, чтобы период не перепрыгивал зимний пропуск сезона.
    """
    d = df_z.sort_values(["anon_polygon_id", "date"]).reset_index()
    restored = None if restored_mask is None else restored_mask[d["index"].to_numpy()]
    periods: list[dict] = []
    for pid, g in d.groupby("anon_polygon_id"):
        n_years = int(g["year"].nunique())
        gi = g.index.to_numpy()
        pos_of = {int(i): k for k, i in enumerate(gi)}
        run: list[int] = []

        def flush(run):
            if not run:
                return
            seg = g.loc[run]
            span = (seg["date"].max() - seg["date"].min()).days + 1
            if span < min_run_days:
                return
            minz = float(seg["z"].min())
            label = "критическая аномалия" if minz < -2 else "угнетение биомассы"
            if n_years < min_ref_years:
                status = "insufficient_data"
            elif restored is not None and restored[[pos_of[r] for r in run]].all():
                status = "candidate"  # только восстановленные точки — не подтверждаем сами себя
            else:
                status = "confirmed"
            rec = {
                "polygon": pid,
                "start": str(seg["date"].min().date()),
                "end": str(seg["date"].max().date()),
                "days": int(span),
                "n_points": len(run),
                "min_z": round(minz, 2),
                "mean_z": round(float(seg["z"].mean()), 2),
                "label": label,
                "status": status,
            }
            for col in context_cols:  # погодные основания, если переданы
                if col in seg.columns:
                    rec[col] = round(float(seg[col].mean()), 2)
            periods.append(rec)

        prev_date = None
        for i in gi:
            z = g.loc[i, "z"]
            cur_date = g.loc[i, "date"]
            big_gap = prev_date is not None and (cur_date - prev_date).days > max_gap_days
            if np.isfinite(z) and z < -1:
                if big_gap:  # разрыв сезона — закрываем прежний период, начинаем новый
                    flush(run)
                    run = []
                run.append(i)
            else:
                flush(run)
                run = []
            prev_date = cur_date
        flush(run)
    periods.sort(key=lambda r: r["min_z"])  # самые тяжёлые сверху
    return periods
