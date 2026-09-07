"""Batch-инференс: <test>.csv -> submission.csv (Задача 1). Config-driven.

Читает контекст (train + тестовый файл с контрольными строками), восстанавливает
цель для контрольных строк и пишет валидный submission строго в формате кейса
(имена колонок берутся из CaseConfig). По умолчанию — конфиг вегетации; под кейс
НН достаточно поменять CFG (см. dzz/config.py).

Запуск (из корня репозитория):
    python ml/make_submission.py \
        --context ml/sample_data/train_dataset.csv \
        --test ml/sample_data/test.csv \
        --out submission.csv --ensemble
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

import dzz

CFG = dzz.VEGETATION  # ← под кейс НН: подставь свой CaseConfig из dzz/config.py


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--context", nargs="+", default=[], help="файлы с известной целью (train и т.п.)")
    ap.add_argument("--test", required=True, help="файл с контрольными строками")
    ap.add_argument("--out", default="submission.csv")
    ap.add_argument("--model", action="store_true", help="leak-free модель (иначе anchor)")
    ap.add_argument("--ensemble", action="store_true", help="ансамбль модели по 3 seed (лучше, дольше)")
    args = ap.parse_args()

    frames = [pd.read_csv(p) for p in args.context] + [pd.read_csv(args.test)]
    df = dzz.prepare(pd.concat(frames, ignore_index=True), CFG)

    if CFG.control_flag_col and CFG.control_flag_col in df.columns:
        targets = (df[CFG.control_flag_col] == True).to_numpy()  # noqa: E712
    else:  # нет флага — восстанавливаем там, где цель пуста
        targets = df["target"].isna().to_numpy()
    visible = df["target"].notna().to_numpy()
    print(f"контекст: {len(df)} строк, {df.anon_polygon_id.nunique()} объектов; "
          f"контрольных строк: {int(targets.sum())}")

    if args.ensemble:
        pred = dzz.reconstruct_model_ensemble(df, visible, targets, cfg=CFG)
    elif args.model:
        pred = dzz.reconstruct_model(df, visible, targets, seed=0, cfg=CFG)
    else:
        pred = dzz.reconstruct_anchor(df, visible, targets)
    # подстраховка baseline там, где основной метод не посчитался
    nanpos = np.where(targets & ~np.isfinite(pred))[0]
    if len(nanpos):
        pred[nanpos] = dzz.reconstruct_baseline(df, visible, targets)[nanpos]

    fill = float(np.nanmean(df["target"].to_numpy()))
    p = np.where(np.isfinite(pred[targets]), pred[targets], fill)
    p = np.clip(p, -1.0, 1.0)  # индекс физически ограничен [-1, 1]

    sub = pd.DataFrame({
        CFG.id_col: df.loc[targets, "anon_polygon_id"].to_numpy(),
        CFG.date_col: df.loc[targets, "date"].dt.strftime("%Y-%m-%d").to_numpy(),
        CFG.pred_col: np.round(p, 6),
    })
    dzz.validate_submission(sub, sub[[CFG.id_col, CFG.date_col]], CFG)
    sub.to_csv(args.out, index=False)
    print(f"OK: {len(sub)} строк -> {args.out}  (валидатор пройден)")


if __name__ == "__main__":
    main()
