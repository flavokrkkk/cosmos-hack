"""Честная локальная проверка GapScore на маске организаторов.

Берём train (где цель известна), прячем часть наблюдений по профилю организаторов,
восстанавливаем и считаем RMSE/GapScore. Единственный корректный способ оценить
решение до платформы: воспроизводит маскирование, а не подсматривает тот же день.

Запуск (из корня репозитория):
    python ml/local_eval.py --data ml/sample_data/train_dataset.csv --model --ensemble
"""

from __future__ import annotations

import argparse
import time

import numpy as np
import pandas as pd

import dzz


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="train с известной целью")
    ap.add_argument("--frac", type=float, default=0.15, help="доля скрытых наблюдений")
    ap.add_argument("--seed", type=int, default=99, help="seed контрольной маски")
    ap.add_argument("--model", action="store_true", help="прогнать leak-free модель (дольше)")
    ap.add_argument("--ensemble", action="store_true", help="прогнать ансамбль по 3 seed (ещё дольше)")
    args = ap.parse_args()

    df = dzz.prepare(pd.read_csv(args.data))
    hidden = dzz.make_synthetic_gaps(df, frac=args.frac, seed=args.seed)
    visible = df["target"].notna().to_numpy() & ~hidden
    y_true = df["target"].to_numpy()

    n_ctrl = int(hidden.sum())
    print(f"объектов: {df.anon_polygon_id.nunique()}, "
          f"известных наблюдений: {int(df['target'].notna().sum())}, "
          f"контрольных (скрыто): {n_ctrl}\n")

    methods = [
        ("baseline организаторов", dzz.reconstruct_baseline),
        ("anchor (смещение+сглаживание+эффект даты)", dzz.reconstruct_anchor),
    ]
    if args.model:
        methods.append(("leak-free модель (HGB на остаток)",
                        lambda d, v, t: dzz.reconstruct_model(d, v, t, seed=0)))
    if args.ensemble:
        methods.append(("leak-free модель, ансамбль 3 seed",
                        lambda d, v, t: dzz.reconstruct_model_ensemble(d, v, t)))

    print(f"{'метод':46s} {'RMSE':>8s} {'GapScore':>9s} {'время':>7s}")
    print("-" * 74)
    for name, fn in methods:
        t0 = time.time()
        pred = fn(df, visible, hidden)
        m = hidden & np.isfinite(pred)
        r = dzz.rmse(y_true[m], pred[m])
        cov = m.sum() / n_ctrl
        note = "" if cov > 0.999 else f"  (покрытие {cov:.1%})"
        print(f"{name:46s} {r:8.5f} {dzz.gap_score(r):9.2f} {time.time()-t0:6.1f}s{note}")

    print("\nОриентир (отчёт Ростова, честная маска): baseline ~0.094 / ~1.7,"
          " anchor ~0.085 / ~4.5, модель ~0.063 / ~11.")


if __name__ == "__main__":
    main()
