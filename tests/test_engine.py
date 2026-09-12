"""Контроль формул и границ (критерий Т1).

Проверяем три вещи:
1. Исходные данные кейса не подменены.
2. Наши числа получаются каноническими формулами и совпадают с ручным расчётом.
3. Границы ограничений включают саму границу, а диагностика не расходится с
   каноническим `check_constraints`.
"""

from __future__ import annotations

import pytest

from backend.app.core.services.portfolio_engine import canonical, constraints, space


# --------------------------------------------------------------------------- #
# 1. Целостность исходных данных
# --------------------------------------------------------------------------- #
def test_source_data_untouched():
    lots, modes, config = canonical.load_case()
    assert len(lots) == 8, "в кейсе ровно восемь лотов"
    assert len(modes) == 3, "канонических режимов доступа три: A, B, C"
    assert config["case_version"] == "1.1"
    assert config["scenarios"]["BASE"]["c0_max_mrub"] == 1300
    assert config["scenarios"]["STRESS"]["c0_max_mrub"] == 1180
    common = config["constraints_common"]
    assert common["selected_lots_exactly"] == 4
    assert common["min_public_core_lots"] == 2
    assert common["opex_max_mrub_per_year"] == 360
    assert common["vpub_min_mrub_per_year"] == 1000
    assert common["kcash_min"] == 0.6
    assert common["t_rep_min"] == 0.63


def test_only_mode_a_is_public_core():
    """На этом факте держится ограничение public_core_lots >= 2."""
    _, modes, _ = canonical.load_case()
    flags = dict(zip(modes.mode_id, modes.public_core))
    assert bool(flags["A"]) is True
    assert bool(flags["B"]) is False
    assert bool(flags["C"]) is False


# --------------------------------------------------------------------------- #
# 2. Формулы: ручной расчёт против канонического
# --------------------------------------------------------------------------- #
def test_apply_mode_matches_manual_computation():
    """FIRE в режиме A, посчитанный руками по формулам из инструкции кейса."""
    detail, _ = canonical.evaluate([("FIRE", "A")])
    row = detail.iloc[0]
    # Исходные значения FIRE: c0=320, opex=85, anchor=75, commercial=35, vpub=560.
    # Режим A: k_c0=1.05, k_opex=1.05, k_vpub=1.00, k_anchor=1.00, k_commercial=0.25.
    assert row.c0_mrub == pytest.approx(320 * 1.05)
    assert row.opex_mrub_per_year == pytest.approx(85 * 1.05)
    assert row.vpub_mrub_per_year == pytest.approx(560 * 1.00)
    assert row.cash_mrub_per_year == pytest.approx(75 * 1.00 + 35 * 0.25)


def test_portfolio_aggregation_matches_manual_sum():
    """Рекомендуемый портфель: суммы и производные показатели."""
    selection = [("FIRE", "A"), ("AGRI", "A"), ("TRANS", "B"), ("ENV", "A")]
    _, metrics = canonical.evaluate(selection)

    assert metrics["c0_mrub"] == pytest.approx(336 + 273 + 250 + 294)  # 1153.0
    assert metrics["opex_mrub_per_year"] == pytest.approx(89.25 + 78.75 + 70 + 78.75)  # 316.75
    assert metrics["vpub_mrub_per_year"] == pytest.approx(560 + 230 + 180.4 + 360)  # 1330.4
    assert metrics["cash_mrub_per_year"] == pytest.approx(83.75 + 60 + 102.5 + 76.25)  # 322.5
    # kcash — это ровно cash/opex и ничего больше.
    assert metrics["kcash"] == pytest.approx(322.5 / 316.75)
    # t_rep агрегируется средним арифметическим.
    assert metrics["t_rep"] == pytest.approx((0.68 + 0.74 + 0.77 + 0.73) / 4)
    assert metrics["public_core_lots"] == 3
    assert metrics["territorial_archetypes"] == 4


def test_federal_lot_excluded_from_territorial_count():
    """SSA помечен federal и не должен попадать в счётчик архетипов."""
    _, metrics = canonical.evaluate(
        [("SSA", "A"), ("AGRI", "A"), ("TRANS", "B"), ("ENV", "A")]
    )
    assert metrics["territorial_archetypes"] == 3


def test_capability_normalisation():
    """PNT, InSAR и PNT/InSAR схлопываются в одну группу."""
    assert canonical.case_core.normalize_capability("PNT") == {"PNT/InSAR"}
    assert canonical.case_core.normalize_capability("InSAR") == {"PNT/InSAR"}
    assert canonical.case_core.normalize_capability("PNT/InSAR") == {"PNT/InSAR"}


# --------------------------------------------------------------------------- #
# 3. Ограничения и границы
# --------------------------------------------------------------------------- #
def test_diagnosis_agrees_with_canonical_checks():
    """Наша обогащённая таблица обязана совпадать с каноническим ответом."""
    selection = [("FIRE", "A"), ("AGRI", "A"), ("TRANS", "B"), ("ENV", "A")]
    _, metrics = canonical.evaluate(selection)
    for scenario in ("BASE", "STRESS"):
        rows = constraints.diagnose(metrics, scenario)  # внутри — сверка с case_core
        reference = canonical.canonical_checks(metrics, scenario)
        assert {r.code: r.passed for r in rows} == reference


@pytest.mark.parametrize("scenario,limit", [("BASE", 1300), ("STRESS", 1180)])
def test_c0_boundary_is_inclusive(scenario, limit):
    """Значение ровно на пороге должно проходить."""
    metrics = {
        "selected_lots": 4, "territorial_archetypes": 4, "capability_groups": 2,
        "public_core_lots": 2, "c0_mrub": limit, "opex_mrub_per_year": 360,
        "vpub_mrub_per_year": 1000, "kcash": 0.6, "t_rep": 0.63,
    }
    rows = constraints.diagnose(metrics, scenario)
    assert constraints.all_passed(rows), [r.code for r in constraints.failed(rows)]


def test_c0_above_limit_fails_with_actual_value():
    """При нарушении видно и порог, и фактическое значение (критерий Т3)."""
    metrics = {
        "selected_lots": 4, "territorial_archetypes": 4, "capability_groups": 2,
        "public_core_lots": 2, "c0_mrub": 1181, "opex_mrub_per_year": 300,
        "vpub_mrub_per_year": 1000, "kcash": 0.6, "t_rep": 0.63,
    }
    rows = constraints.diagnose(metrics, "STRESS")
    broken = constraints.failed(rows)
    assert [r.code for r in broken] == ["c0_limit"]
    assert broken[0].threshold == 1180
    assert broken[0].actual == 1181
    assert broken[0].slack == pytest.approx(-1)


@pytest.mark.parametrize("scenario", ["BASE", "STRESS"])
@pytest.mark.parametrize("code,metric,threshold,outside", [
    ("exact_lot_count", "selected_lots", 4, 3),
    ("exact_lot_count", "selected_lots", 4, 5),
    ("territorial_archetypes", "territorial_archetypes", 3, 2),
    ("capability_groups", "capability_groups", 2, 1),
    ("public_core_lots", "public_core_lots", 2, 1),
    ("c0_limit", "c0_mrub", None, None),
    ("opex_limit", "opex_mrub_per_year", 360, 360.000001),
    ("vpub_floor", "vpub_mrub_per_year", 1000, 999.999999),
    ("kcash_floor", "kcash", 0.6, 0.599999),
    ("t_rep_floor", "t_rep", 0.63, 0.629999),
])
def test_every_official_boundary_and_value_just_outside(scenario, code, metric, threshold, outside):
    """Все девять условий: равенство проходит, шаг за допуск 1e-9 показывает факт и FAIL.

    Синтетические метрики нужны только для изоляции каждой границы; исходные CSV
    не меняются, а диагноз дополнительно сверяется с case_core организаторов.
    """
    c0_limit = 1300 if scenario == "BASE" else 1180
    metrics = {
        "selected_lots": 4, "territorial_archetypes": 3, "capability_groups": 2,
        "public_core_lots": 2, "c0_mrub": c0_limit, "opex_mrub_per_year": 360,
        "vpub_mrub_per_year": 1000, "kcash": 0.6, "t_rep": 0.63,
    }
    if metric == "c0_mrub":
        threshold, outside = c0_limit, c0_limit + 0.000001
    metrics[metric] = threshold
    assert constraints.all_passed(constraints.diagnose(metrics, scenario))
    metrics[metric] = outside
    broken = constraints.failed(constraints.diagnose(metrics, scenario))
    assert len(broken) == 1
    row = broken[0]
    assert (row.code, row.threshold, row.actual) == (code, threshold, outside)
    assert row.slack is None if row.operator == "==" else row.slack < 0


def test_subsidised_portfolio_remains_officially_feasible():
    """Отрицательный S не является десятым скрытым ограничением кейса."""
    selection = [("FIRE", "A"), ("AGRI", "A"), ("TRANS", "A"), ("ENV", "A")]
    _, metrics = canonical.evaluate(selection)
    assert metrics["cash_mrub_per_year"] - metrics["opex_mrub_per_year"] == pytest.approx(-31.5)
    assert 0.6 <= metrics["kcash"] < 1
    for scenario in ("BASE", "STRESS"):
        assert constraints.all_passed(constraints.diagnose(metrics, scenario))
        allowed = space.feasible(scenario)
        assert ((allowed.lots == "FIRE+AGRI+TRANS+ENV") & (allowed.modes == "AAAA")).any()


def test_single_lot_fails_exact_count():
    """Дымовая проверка из инструкции кейса: один лот не образует портфель."""
    _, metrics = canonical.evaluate([("FIRE", "A")])
    rows = constraints.diagnose(metrics, "BASE")
    assert not constraints.all_passed(rows)
    assert "exact_lot_count" in [r.code for r in constraints.failed(rows)]


# --------------------------------------------------------------------------- #
# 4. Пространство решений — защита от регрессии
# --------------------------------------------------------------------------- #
def test_space_size_and_feasibility_counts():
    frame = space.enumerate_space()
    assert len(frame) == 5670, "C(8,4)=70 наборов × 3^4=81 назначение"
    assert int(frame.BASE_ok.sum()) == 1031
    assert int(frame.STRESS_ok.sum()) == 143


def test_stress_is_subset_of_base():
    """STRESS отличается только более жёстким лимитом c0, поэтому строго вложен в BASE."""
    frame = space.enumerate_space()
    assert not (frame.STRESS_ok & ~frame.BASE_ok).any()


def test_arctic_never_feasible_under_stress():
    """Вывод, на который опирается отказ от ARCTIC в записке."""
    stress = space.feasible("STRESS")
    assert not stress["lots"].str.contains("ARCTIC").any()


def test_non_binding_constraints():
    """Эти ограничения не заваливают ни одной конфигурации — важный вывод для П2."""
    binding = space.binding_analysis().set_index("constraint")["failures"].to_dict()
    assert binding["territorial_archetypes"] == 0
    assert binding["capability_groups"] == 0
    assert binding["kcash_floor"] == 0


def test_pareto_front_is_non_dominated():
    front = space.pareto_front(space.feasible("STRESS"))
    assert 0 < len(front) <= len(space.feasible("STRESS"))
    highs = front[list(space.MAXIMIZE)].to_numpy()
    lows = front[list(space.MINIMIZE)].to_numpy()
    for i in range(len(front)):
        not_worse = (highs >= highs[i]).all(axis=1) & (lows <= lows[i]).all(axis=1)
        better = (highs > highs[i]).any(axis=1) | (lows < lows[i]).any(axis=1)
        assert not bool((not_worse & better).any()), "внутри фронта не должно быть доминирования"


def test_parse_selection_roundtrip():
    parsed = space.parse_selection("FIRE:A, AGRI:A ,TRANS:B,ENV:A")
    assert parsed == [("FIRE", "A"), ("AGRI", "A"), ("TRANS", "B"), ("ENV", "A")]
    assert space.format_selection(parsed) == "FIRE:A,AGRI:A,TRANS:B,ENV:A"


def test_recommended_variant_from_config_passes_both_scenarios():
    """Портфель из config/decision.json проходит и BASE, и STRESS."""
    from backend.app.core.services.portfolio_engine.decision import load_decision

    decision = load_decision()
    _, metrics = canonical.evaluate(decision.recommended.selection)
    for scenario in ("BASE", "STRESS"):
        rows = constraints.diagnose(metrics, scenario)
        assert constraints.all_passed(rows), (
            f"{scenario}: {[r.code for r in constraints.failed(rows)]}"
        )


# --------------------------------------------------------------------------- #
# 5. Анализ устойчивости
# --------------------------------------------------------------------------- #
def test_headroom_is_verified_numerically():
    """Аналитика запаса проверяется численно: на границе PASS, за границей FAIL."""
    from backend.app.core.services.portfolio_engine import sensitivity

    selection = [("FIRE", "A"), ("AGRI", "A"), ("TRANS", "B"), ("ENV", "A")]
    for scenario in ("BASE", "STRESS"):
        assert sensitivity.verify_headroom(selection, scenario), scenario


def test_c0_is_narrowest_input_under_stress():
    """В стрессе самое узкое место — стартовые затраты, а не OPEX или поступления."""
    from backend.app.core.services.portfolio_engine import sensitivity

    selection = [("FIRE", "A"), ("AGRI", "A"), ("TRANS", "B"), ("ENV", "A")]
    narrow = sensitivity.binding_first(selection, "STRESS")
    assert narrow.input_name.startswith("c0")


def test_c0_breaking_point_matches_portfolio_c0():
    from backend.app.core.services.portfolio_engine import sensitivity

    selection = [("FIRE", "A"), ("AGRI", "A"), ("TRANS", "B"), ("ENV", "A")]
    point = sensitivity.c0_breaking_point(selection)
    assert point["portfolio_c0"] == pytest.approx(1153.0)
    assert point["stress_slack"] == pytest.approx(1180 - 1153.0)
    assert point["breaks_below_limit"] == pytest.approx(point["portfolio_c0"])


# --------------------------------------------------------------------------- #
# 6. Корректность Парето-фронта: полнота и независимость от округления
# --------------------------------------------------------------------------- #
def _dominated_by_any(highs, lows, index):
    """Есть ли конфигурация, не худшая по всем показателям и лучшая хотя бы по одному."""
    not_worse = (highs >= highs[index]).all(axis=1) & (lows <= lows[index]).all(axis=1)
    better = (highs > highs[index]).any(axis=1) | (lows < lows[index]).any(axis=1)
    return bool((not_worse & better).any())


def test_pareto_front_is_complete():
    """Ни одна конфигурация ВНЕ фронта не осталась недоминируемой.

    Проверка `test_pareto_front_is_non_dominated` говорит только, что внутри фронта
    нет доминирования. Это не то же самое: фронт мог бы недосчитать варианты и
    всё равно пройти ту проверку. Здесь смотрим с другой стороны — каждая
    отброшенная конфигурация обязана иметь того, кто её доминирует.
    """
    feasible_frame = space.feasible("STRESS").reset_index(drop=True)
    front = space.pareto_front(feasible_frame)
    in_front = set(zip(front.lots, front.modes))

    highs = feasible_frame[list(space.MAXIMIZE)].to_numpy()
    lows = feasible_frame[list(space.MINIMIZE)].to_numpy()

    missed = [
        (feasible_frame.lots[i], feasible_frame.modes[i])
        for i in range(len(feasible_frame))
        if (feasible_frame.lots[i], feasible_frame.modes[i]) not in in_front
        and not _dominated_by_any(highs, lows, i)
    ]
    assert missed == [], f"недоминируемые конфигурации вне фронта: {missed}"


def test_pareto_front_does_not_depend_on_rounding():
    """Фронт на отображаемых числах совпадает с фронтом на канонических.

    `space.metrics_row` округляет показатели для вывода и CSV. Парето считается
    по этим же колонкам, поэтому теоретически два варианта, различающиеся за
    пределами округления, могли слипнуться и один ошибочно вытеснить другой.
    Пересчитываем фронт по неокруглённым значениям из `evaluate` и сравниваем
    состав.
    """
    import numpy as np

    feasible_frame = space.feasible("STRESS").reset_index(drop=True)
    rounded = set(zip(*map(tuple, space.pareto_front(feasible_frame)[["lots", "modes"]].values.T)))

    exact_rows = []
    for row in feasible_frame.itertuples():
        _, metrics = canonical.evaluate(list(zip(row.lots.split("+"), row.modes)))
        exact_rows.append([
            metrics["vpub_mrub_per_year"], metrics["kcash"], metrics["t_rep"],
            metrics["readiness_1_5"], metrics["resilience_1_5"], metrics["scale_1_5"],
            metrics["c0_mrub"], metrics["opex_mrub_per_year"],
        ])
    exact = np.array(exact_rows, dtype=float)
    highs, lows = exact[:, :6], exact[:, 6:]

    exact_front = {
        (feasible_frame.lots[i], feasible_frame.modes[i])
        for i in range(len(exact))
        if not _dominated_by_any(highs, lows, i)
    }
    assert exact_front == rounded, f"округление меняет состав фронта: {exact_front ^ rounded}"


def test_surplus_headroom_matches_kcash_and_is_marked_as_team_threshold():
    """Запас до нулевого остатка выгружается и помечен как порог команды, а не кейса."""
    from backend.app.core.services.portfolio_engine import load_decision, surplus_headroom

    selection = load_decision().recommended.selection
    _, metrics = canonical.evaluate(selection)
    kcash = metrics['kcash']
    rows = {row.direction: row for row in surplus_headroom(selection)}
    assert rows['рост'].limit_factor == pytest.approx(kcash)
    assert rows['падение'].limit_factor == pytest.approx(1 / kcash)
    for row in rows.values():
        assert 'порог команды' in row.binding
        # Официальные ограничения на этой границе ещё проходят: порог действительно наш.
        assert row.change_pct > 0


# Учебно-справочный материал кейсодержателя от 12.09.2026 содержит два проверенных примера
# с числами. Это независимые векторы: если наш слой разойдётся с каноном, тест упадёт здесь,
# а не на защите. Источник — docs/notes/2026-09-12-reference-material.md.
REFERENCE_FIRE_MODES = {
    'A': dict(c0_mrub=336.0, opex_mrub_per_year=89.25, cash_mrub_per_year=83.75,
              vpub_mrub_per_year=560.0, kcash=0.938),
    'B': dict(c0_mrub=320.0, opex_mrub_per_year=85.0, cash_mrub_per_year=84.50,
              vpub_mrub_per_year=459.2, kcash=0.994),
    'C': dict(c0_mrub=313.6, opex_mrub_per_year=80.75, cash_mrub_per_year=67.00,
              vpub_mrub_per_year=347.2, kcash=0.830),
}


@pytest.mark.parametrize('mode', sorted(REFERENCE_FIRE_MODES))
def test_reference_example_fire_in_three_modes(mode):
    """Раздел 4.4 справочного материала: FIRE в режимах A, B, C."""
    expected = REFERENCE_FIRE_MODES[mode]
    _, metrics = canonical.evaluate([('FIRE', mode)])
    for key, value in expected.items():
        digits = 3 if key == 'kcash' else 10
        assert round(metrics[key], digits) == value, (mode, key, metrics[key])


def test_reference_example_portfolio_fails_stress_on_c0_only():
    """Раздел 6 справочного материала: FIRE(A)+FLOOD(A)+AGRI(C)+TRANS(C) проходит BASE и валит STRESS.

    Кейсодержатель приводит этот портфель как образец правильного входа в стресс: сначала
    честный пересчёт, потом управленческое решение. Сумма исходных c0 без коэффициентов — 1170,
    то есть лимит 1180 нарушается именно из-за коэффициентов режима, а не из-за данных.
    """
    selection = [('FIRE', 'A'), ('FLOOD', 'A'), ('AGRI', 'C'), ('TRANS', 'C')]
    _, metrics = canonical.evaluate(selection)
    assert metrics['c0_mrub'] == 1192.8
    assert metrics['opex_mrub_per_year'] == 321.5
    assert metrics['cash_mrub_per_year'] == 418.0
    assert metrics['vpub_mrub_per_year'] == 1439.0
    assert metrics['t_rep'] == 0.7025
    assert round(metrics['kcash'], 2) == 1.30
    assert (metrics['territorial_archetypes'], metrics['capability_groups'],
            metrics['public_core_lots']) == (4, 2, 2)

    assert all(row.passed for row in constraints.diagnose(metrics, 'BASE'))
    failed = [row.code for row in constraints.diagnose(metrics, 'STRESS') if not row.passed]
    assert failed == ['c0_limit'], failed

    lots = canonical.load_case()[0]
    raw = sum(float(lots.loc[lots.lot_id == lot, 'c0_mrub'].iloc[0]) for lot, _ in selection)
    assert raw == 1170, 'сумма исходных c0 без коэффициентов режима'
