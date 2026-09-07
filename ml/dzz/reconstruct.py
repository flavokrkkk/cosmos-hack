"""Восстановители ряда — от baseline до leak-free модели на остаток.

Лестница методов (каждый следующий закрывает слабость предыдущего):
    baseline  -> anchor  -> model  -> ensemble
Модель предсказывает ОСТАТОК от физически осмысленной опорной оценки (anchor),
поэтому при слабом сигнале её вклад -> 0 и результат не хуже anchor.
"""

from __future__ import annotations

from collections import defaultdict

import numpy as np
import pandas as pd

from .config import VEGETATION, CaseConfig
from .features import feature_frame, gauss_smooth, known_series, source_probabilities
from .masking import make_synthetic_gaps


def reconstruct_baseline(df: pd.DataFrame, visible: np.ndarray, targets: np.ndarray) -> np.ndarray:
    """Baseline организаторов: среднее ближайших известных слева и справа."""
    pred = np.full(len(df), np.nan)
    for _, idx in df.groupby("anon_polygon_id").groups.items():
        pos = np.array(idx)
        g = df.loc[pos]
        kday, kval, _ksrc, day = known_series(g, visible[pos])
        if len(kday) == 0:
            continue
        for j, p in enumerate(pos):
            if not targets[p]:
                continue
            t = day[j]
            lv = kval[kday < t][-1] if (kday < t).any() else np.nan
            rv = kval[kday > t][0] if (kday > t).any() else np.nan
            vals = [v for v in (lv, rv) if not np.isnan(v)]
            pred[p] = float(np.mean(vals)) if vals else np.nan
    return pred


def reconstruct_anchor(df: pd.DataFrame, visible: np.ndarray, targets: np.ndarray,
                       bw: float = 8.0) -> np.ndarray:
    """Опорная оценка: снятие сенсорного смещения + сглаживание + эффект даты.

    1. offset(объект, источник) = средний остаток наблюдений источника относительно
       сглаженной кривой (снимает разнокалиброванность сенсоров);
    2. сглаженная кривая S(t) по видимым наблюдениям;
    3. эффект даты: средний остаток ДРУГИХ объектов в тот же день (общее состояние
       атмосферы), свой объект исключён — утечки нет.
    anchor(t) = S(t) + ожидаемое смещение источника(t) + эффект_даты(t).
    """
    global_off: dict[str, list[float]] = defaultdict(list)  # имена источников — из данных
    poly_off: dict[tuple, float] = {}
    smoothed: dict[str, tuple] = {}
    date_resid: dict[pd.Timestamp, list[tuple]] = {}

    groups = {pid: np.array(idx) for pid, idx in df.groupby("anon_polygon_id").groups.items()}
    for pid, pos in groups.items():
        g = df.loc[pos]
        kday, kval, ksrc, _day = known_series(g, visible[pos])
        smoothed[pid] = (kday, kval)
        if len(kday) < 5:
            continue
        base = np.array([gauss_smooth(kday, kval, t, bw) for t in kday])
        resid = kval - base
        for s in set(ksrc):
            r = resid[ksrc == s]
            r = r[np.isfinite(r)]
            if len(r):
                poly_off[(pid, s)] = float(np.mean(r))
                global_off[s].extend(r.tolist())
        # накопить остатки по календарной дате для эффекта даты
        dts = g["date"].to_numpy()[visible[pos] & g["target"].notna().to_numpy()]
        for dt, rr in zip(dts, resid):
            if np.isfinite(rr):
                date_resid.setdefault(pd.Timestamp(dt), []).append((pid, rr))
    global_off = {s: (float(np.mean(v)) if v else 0.0) for s, v in global_off.items()}

    src_prob = source_probabilities(df, visible)

    pred = np.full(len(df), np.nan)
    for pid, pos in groups.items():
        g = df.loc[pos]
        kday, kval = smoothed[pid]
        day = (g["date"] - g["date"].min()).dt.days.to_numpy()
        if len(kday) == 0:
            continue
        for j, p in enumerate(pos):
            if not targets[p]:
                continue
            base = gauss_smooth(kday, kval, day[j], bw)
            if np.isnan(base):
                continue
            # ожидаемое смещение источника по вероятности в эту дату
            probs = src_prob(g.iloc[j]["doy"])
            exp_off = sum(w * poly_off.get((pid, s), global_off.get(s, 0.0)) for s, w in probs.items())
            # эффект даты: остатки ДРУГИХ объектов в тот же календарный день
            others = date_resid.get(pd.Timestamp(g.iloc[j]["date"]), [])
            de = [r for (opid, r) in others if opid != pid]
            pred[p] = base + exp_off + (float(np.mean(de)) if de else 0.0)
    return pred


def reconstruct_model(df: pd.DataFrame, visible: np.ndarray, targets: np.ndarray,
                      seed: int = 0, train_frac: float = 0.15,
                      cfg: CaseConfig = VEGETATION) -> np.ndarray:
    """Leak-free HistGradientBoosting на остаток от anchor.

    Обучающие примеры получаем, дополнительно скрывая часть ВИДИМЫХ наблюдений
    (train-маска) — как на реальной подаче. Для них считаем anchor и признаки по
    оставшимся видимым, цель обучения = true - anchor. Затем предсказываем остаток
    для настоящих targets и прибавляем к их anchor.
    """
    from sklearn.ensemble import HistGradientBoostingRegressor

    src_prob = source_probabilities(df, visible)

    # 1) обучающая маска поверх видимых
    train_hidden = make_synthetic_gaps(df, frac=train_frac, seed=1000 + seed) & visible
    vis_for_train = visible & ~train_hidden
    anc_tr = reconstruct_anchor(df, vis_for_train, train_hidden)
    Xtr, itr = feature_frame(df, vis_for_train, train_hidden, anc_tr, src_prob, cfg)
    ytr = df["target"].to_numpy()[itr] - anc_tr[itr]
    ok = np.isfinite(ytr) & np.isfinite(Xtr["anchor"].to_numpy())
    Xtr, ytr = Xtr[ok], ytr[ok]

    # 2) обучение
    model = HistGradientBoostingRegressor(
        learning_rate=0.03, max_leaf_nodes=63, min_samples_leaf=60,
        l2_regularization=2.0, max_iter=800, early_stopping=True,
        validation_fraction=0.1, random_state=seed,
    )
    model.fit(Xtr.fillna(-1.0), ytr)

    # 3) предсказание для настоящих targets
    anc = reconstruct_anchor(df, visible, targets)
    Xte, ite = feature_frame(df, visible, targets, anc, src_prob, cfg)
    pred = anc.copy()
    pred[ite] = anc[ite] + model.predict(Xte.fillna(-1.0))
    # подстраховка: где anchor не посчитался — вернуть baseline
    nan = np.where(targets & ~np.isfinite(pred))[0]
    if len(nan):
        pred[nan] = reconstruct_baseline(df, visible, targets)[nan]
    return pred


def reconstruct_model_ensemble(df: pd.DataFrame, visible: np.ndarray, targets: np.ndarray,
                               seeds=(0, 1, 2), cfg: CaseConfig = VEGETATION) -> np.ndarray:
    """Среднее предсказаний по нескольким seed — заметно стабильнее одиночной модели."""
    acc = np.zeros(len(df))
    cnt = np.zeros(len(df))
    for s in seeds:
        p = reconstruct_model(df, visible, targets, seed=s, cfg=cfg)
        m = np.isfinite(p)
        acc[m] += p[m]
        cnt[m] += 1
    out = np.full(len(df), np.nan)
    out[cnt > 0] = acc[cnt > 0] / cnt[cnt > 0]
    return out
