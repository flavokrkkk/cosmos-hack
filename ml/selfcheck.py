"""Самопроверка ML-ядра: работоспособность, leak-free и генерализуемость.

Прогоняет батарею проверок на sample_data и печатает PASS/FAIL. Ненулевой код
возврата, если хоть одна упала. Полезно и как доказательство качества для жюри:
решение проверяемо, а не «поверьте на слово».

Запуск (из корня репозитория):
    python ml/selfcheck.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

import dzz

TRAIN = Path(__file__).parent / "sample_data" / "train_dataset.csv"
fails: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        fails.append(name)


# --------------------------------------------------------------------------- #
print("1. Метрика (формула регламента)")
check("gap_score(0.00) == 30", dzz.gap_score(0.00) == 30.0)
check("gap_score(0.05) == 15", dzz.gap_score(0.05) == 15.0)
check("gap_score(0.10) == 0", dzz.gap_score(0.10) == 0.0)
check("gap_score(0.20) == 0 (клип снизу)", dzz.gap_score(0.20) == 0.0)

# --------------------------------------------------------------------------- #
print("\n2. Загрузка и honest-маска")
df = dzz.prepare(pd.read_csv(TRAIN))
hidden = dzz.make_synthetic_gaps(df, seed=99)
visible = df["target"].notna().to_numpy() & ~hidden
y = df["target"].to_numpy()
check("канонические колонки на месте",
      {"anon_polygon_id", "date", "target", "sensor", "doy", "year"} <= set(df.columns))
check("маска прячет ~15% известных и оставляет соседей",
      0.10 < hidden.sum() / df["target"].notna().sum() < 0.20,
      f"{int(hidden.sum())} строк")

# --------------------------------------------------------------------------- #
print("\n3. Детерминированность (тот же seed → тот же результат)")
a1 = dzz.reconstruct_anchor(df, visible, hidden)
a2 = dzz.reconstruct_anchor(df, visible, hidden)
check("anchor воспроизводим побитно", np.allclose(a1, a2, equal_nan=True))

# --------------------------------------------------------------------------- #
print("\n4. Leak-free: значение самой контрольной строки НЕ используется")
# Портим на скрытых строках цель и все динамические колонки «мусором» (оставляя
# target непустым, чтобы не сдвинуть внутреннюю маску). Если предсказание не
# изменилось — модель их не читает, то есть утечки нет.
df_g = df.copy()
dyn = [c for c in ["target", "sensor", "s2_ndvi", "s2_evi", "s2_ndwi",
                   "landsat_ndvi", "landsat_evi", "landsat_ndwi", "modis_ndvi", "modis_evi",
                   "era5_temp_c", "era5_precip_mm", "ndvi_climatology_mean",
                   "ndvi_climatology_std", "ndvi_zscore", "status", "n_reference_years"]
       if c in df_g.columns]
df_g.loc[df_g.index[hidden], dyn] = 999.0  # заведомо «утекающий» мусор
p_clean = dzz.reconstruct_model(df, visible, hidden, seed=0)
p_dirty = dzz.reconstruct_model(df_g, visible, hidden, seed=0)
check("модель игнорирует значения скрытой строки",
      np.allclose(p_clean[hidden], p_dirty[hidden], atol=1e-9),
      "предсказание не изменилось при порче колонок контрольных строк")

# --------------------------------------------------------------------------- #
print("\n5. Качество восстановления (honest-маска)")
m = hidden & np.isfinite(a1)
r_anchor = dzz.rmse(y[m], a1[m])
mm = hidden & np.isfinite(p_clean)
r_model = dzz.rmse(y[mm], p_clean[mm])
check("anchor заметно лучше порога 0.10", r_anchor < 0.085, f"RMSE {r_anchor:.4f} / GapScore {dzz.gap_score(r_anchor)}")
check("модель лучше anchor", r_model < r_anchor, f"RMSE {r_model:.4f} / GapScore {dzz.gap_score(r_model)}")

# --------------------------------------------------------------------------- #
print("\n6. Валидатор submission (строгий формат)")
sub_ok = pd.DataFrame({
    "anon_polygon_id": df.loc[hidden, "anon_polygon_id"].to_numpy(),
    "date": df.loc[hidden, "date"].dt.strftime("%Y-%m-%d").to_numpy(),
    "primary_ndvi_pred": np.clip(np.nan_to_num(p_clean[hidden], nan=0.3), -1, 1),
})
try:
    dzz.validate_submission(sub_ok, sub_ok[["anon_polygon_id", "date"]])
    check("валидный submission принимается", True)
except Exception as e:  # noqa: BLE001
    check("валидный submission принимается", False, str(e))

bad = sub_ok.copy()
bad.loc[0, "primary_ndvi_pred"] = np.nan
try:
    dzz.validate_submission(bad, sub_ok[["anon_polygon_id", "date"]])
    check("NaN в submission отклоняется", False)
except ValueError:
    check("NaN в submission отклоняется", True)

try:
    dzz.validate_submission(sub_ok.iloc[:-5], sub_ok[["anon_polygon_id", "date"]])
    check("несовпадение ключей отклоняется", False)
except ValueError:
    check("несовпадение ключей отклоняется", True)

# --------------------------------------------------------------------------- #
print("\n7. Генерализуемость: ДРУГАЯ схема кейса (другие имена, без сенсоров, без crop)")
raw2 = pd.read_csv(TRAIN).rename(
    columns={"anon_polygon_id": "field_id", "date": "obs_date", "primary_ndvi": "value"})
cfg_b = dzz.CaseConfig(
    name="generic-test", id_col="field_id", date_col="obs_date", target_col="value",
    pred_col="value_pred", control_flag_col=None, source_cols=None, static_cat_col=None)
df_b = dzz.prepare(raw2, cfg_b)
hid_b = dzz.make_synthetic_gaps(df_b, seed=7)
vis_b = df_b["target"].notna().to_numpy() & ~hid_b
pred_b = dzz.reconstruct_model(df_b, vis_b, hid_b, seed=0, cfg=cfg_b)
mb = hid_b & np.isfinite(pred_b)
r_b = dzz.rmse(df_b["target"].to_numpy()[mb], pred_b[mb])
check("пайплайн отработал на другой схеме", np.isfinite(r_b), f"RMSE {r_b:.4f} / GapScore {dzz.gap_score(r_b)}")
sub_b = pd.DataFrame({
    cfg_b.id_col: df_b.loc[hid_b, "anon_polygon_id"].to_numpy(),
    cfg_b.date_col: df_b.loc[hid_b, "date"].dt.strftime("%Y-%m-%d").to_numpy(),
    cfg_b.pred_col: np.clip(np.nan_to_num(pred_b[hid_b], nan=0.3), -1, 1),
})
try:
    dzz.validate_submission(sub_b, sub_b[[cfg_b.id_col, cfg_b.date_col]], cfg_b)
    check("submission другой схемы валиден (имена из конфига)", True)
except Exception as e:  # noqa: BLE001
    check("submission другой схемы валиден (имена из конфига)", False, str(e))

# --------------------------------------------------------------------------- #
print("\n8. Аномалии (Задача 2)")
periods = dzz.detect_anomalies(dzz.seasonal_z(df), min_run_days=5)
ok_struct = periods and all(
    p["days"] >= 5 and p["status"] in {"confirmed", "candidate", "insufficient_data"}
    and p["label"] in {"угнетение биомассы", "критическая аномалия"} for p in periods)
check("периоды найдены и корректно размечены", bool(ok_struct), f"{len(periods)} периодов")

# --------------------------------------------------------------------------- #
print("\n" + "=" * 60)
if fails:
    print(f"ИТОГ: {len(fails)} проверок упало: {fails}")
    sys.exit(1)
print("ИТОГ: все проверки пройдены ✅")
