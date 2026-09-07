"""Демо детекции аномалий (Задача 2) на одном файле.

Считает z-score к сезонной норме и печатает найденные негативные периоды,
отсортированные по тяжести. Погодные основания подхватываются, если есть.

Запуск (из корня репозитория):
    python ml/detect_anomalies.py --data ml/sample_data/train_dataset.csv
"""

from __future__ import annotations

import argparse

import pandas as pd

import dzz


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--top", type=int, default=12)
    args = ap.parse_args()

    df = dzz.prepare(pd.read_csv(args.data))
    ctx = tuple(c for c in ("era5_precip_mm", "era5_temp_c") if c in df.columns)
    dz = dzz.seasonal_z(df)
    periods = dzz.detect_anomalies(dz, min_run_days=5, context_cols=ctx)
    print(f"объектов: {df.anon_polygon_id.nunique()}, "
          f"найдено аномальных периодов: {len(periods)}\n")
    print(f"{'объект':10s} {'период':25s} {'дней':>4s} {'min_z':>6s} {'статус':14s} метка")
    print("-" * 90)
    for p in periods[: args.top]:
        rng = f"{p['start']}…{p['end']}"
        print(f"{p['polygon']:10s} {rng:25s} {p['days']:4d} {p['min_z']:6.2f} "
              f"{p['status']:14s} {p['label']}")


if __name__ == "__main__":
    main()
