"""Конфиг кейса — единственный модуль, который правишь под конкретную ДЗЗ-задачу.

Идея generic-ядра: 80% пайплайна (загрузка, честная маска, метрика/валидатор,
baseline/anchor/модель, признаки, аномалии) не зависит от предметной темы. Тема
входит сюда, в CaseConfig: как называются колонки, есть ли «правило источника»
(смесь сенсоров), какая метрика. `data.prepare()` приводит любые имена к
каноническим, и остальной код работает без изменений.

На старте НН: увидели схему данных -> за ~15 минут заполнили новый CaseConfig ->
запустили local_eval / make_submission. VEGETATION ниже — заполненный пример.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CaseConfig:
    name: str
    id_col: str = "anon_polygon_id"          # идентификатор объекта (полигон/участок/точка)
    date_col: str = "date"                    # дата наблюдения
    target_col: str = "primary_ndvi"          # что восстанавливаем (цель метрики)
    pred_col: str = "primary_ndvi_pred"       # имя колонки предсказания в submission
    control_flag_col: str | None = "is_synthetic_gap"  # флаг контрольной строки (или None)

    # Правило источника: цель = первый непустой из этих колонок (смесь сенсоров).
    # Список (колонка, имя_источника). None — единый источник (тема без сенсорной смеси).
    source_cols: list[tuple[str, str]] | None = None

    # Статический категориальный признак (например культура). None — нет такого.
    static_cat_col: str | None = None
    cat_dict: dict[str, int] | None = None

    # Метрика регламента: GapScore = round(score_max * max(0, 1 - RMSE/threshold), 2)
    metric_threshold: float = 0.10
    score_max: float = 30.0


# --------------------------------------------------------------------------- #
# ЗАПОЛНЕННЫЙ ПРИМЕР — ростовская вегетация (Задача 1). Проверено на реальных данных:
#   * primary_ndvi ТОЧНО = первый непустой из s2 -> landsat -> modis (100% строк);
#   * на контрольной строке скрыто ВСЁ динамическое, остаются только id, date, crop_type.
# --------------------------------------------------------------------------- #
VEGETATION = CaseConfig(
    name="vegetation-ndvi",
    id_col="anon_polygon_id",
    date_col="date",
    target_col="primary_ndvi",
    pred_col="primary_ndvi_pred",
    control_flag_col="is_synthetic_gap",
    source_cols=[("s2_ndvi", "s2"), ("landsat_ndvi", "landsat"), ("modis_ndvi", "modis")],
    static_cat_col="crop_type",
    cat_dict={"зерновые": 0, "озимая пшеница": 1, "пастбища/зерновые": 2, "подсолнечник": 3},
    metric_threshold=0.10,
    score_max=30.0,
)


# --------------------------------------------------------------------------- #
# ШАБЛОН — копируешь и заполняешь под кейс НН, когда увидишь схему данных.
# --------------------------------------------------------------------------- #
TEMPLATE = CaseConfig(
    name="TODO-нн-кейс",
    id_col="TODO_id",              # имя колонки-идентификатора объекта
    date_col="TODO_date",          # имя колонки даты
    target_col="TODO_target",      # что восстанавливаем (цель метрики)
    pred_col="TODO_target_pred",   # как назвать предсказание в submission (см. формат в ЛК)
    control_flag_col=None,         # флаг контрольных строк, если есть; иначе восстанавливаем там, где цель пуста
    source_cols=None,              # если цель = смесь сенсоров, перечисли их по приоритету
    static_cat_col=None,           # статический категориальный признак, если есть
    cat_dict=None,
    metric_threshold=0.10,         # порог из регламента НН (в Ростове был 0.10)
    score_max=30.0,                # максимум баллов метрики
)
