"""Командный интерфейс расчётного инструмента.

Позволяет эксперту воспроизвести все числа записки, не редактируя исходный код:
портфель и альтернативы берутся из `config/decision.json` либо передаются флагом
`--portfolio`, сценарий — флагом `--scenario` (критерии Т2, Т5).

Примеры:

    python -m backend.app.core.services.portfolio_engine evaluate
    python -m backend.app.core.services.portfolio_engine evaluate --portfolio FIRE:A,AGRI:A,TRANS:B,ENV:A --scenario STRESS
    python -m backend.app.core.services.portfolio_engine compare
    python -m backend.app.core.services.portfolio_engine space
    python -m backend.app.core.services.portfolio_engine pareto --scenario STRESS --top 15
    python -m backend.app.core.services.portfolio_engine sensitivity --scenario STRESS
    python -m backend.app.core.services.portfolio_engine export

В автономном комплекте: python run.py <команда>.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Sequence, Tuple

from .canonical import REPO_ROOT, evaluate, scenarios, source_version
from .constraints import diagnose, failed
from .decision import Variant, load_decision, read_decision_config
from .sensitivity import (binding_first, c0_breaking_point, input_headroom,
                          surplus_headroom)
from .selfcheck import run_selfcheck
from .space import (
    binding_analysis,
    enumerate_space,
    feasible,
    format_selection,
    lot_frequency,
    parse_selection,
    pareto_front,
)

RESULTS_DIR = REPO_ROOT / "results"


# --------------------------------------------------------------------------- #
# Вывод
# --------------------------------------------------------------------------- #
def _table(headers: Sequence[str], rows: Sequence[Sequence[object]]) -> str:
    """Простая выравненная таблица без внешних зависимостей."""
    cells = [[str(value) for value in row] for row in rows]
    widths = [len(header) for header in headers]
    for row in cells:
        for index, value in enumerate(row):
            widths[index] = max(widths[index], len(value))
    line = "  ".join(header.ljust(widths[index]) for index, header in enumerate(headers))
    separator = "  ".join("-" * width for width in widths)
    body = [
        "  ".join(value.ljust(widths[index]) for index, value in enumerate(row))
        for row in cells
    ]
    return "\n".join([line, separator] + body)


def _print_metrics(metrics) -> None:
    rows = [
        ["Стартовые затраты c0", f"{metrics['c0_mrub']:.2f}", "млн ₽"],
        ["OPEX", f"{metrics['opex_mrub_per_year']:.2f}", "млн ₽/год"],
        ["Общественная ценность vpub", f"{metrics['vpub_mrub_per_year']:.2f}", "млн ₽/год"],
        ["Денежные поступления cash", f"{metrics['cash_mrub_per_year']:.2f}", "млн ₽/год"],
        ["Годовой остаток S = CASH − OPEX", f"{metrics['cash_mrub_per_year'] - metrics['opex_mrub_per_year']:.2f}", "млн ₽/год"],
        ["kcash = cash / opex", f"{metrics['kcash']:.4f}", "доля"],
        ["t_rep (среднее)", f"{metrics['t_rep']:.4f}", "—"],
        ["readiness (среднее)", f"{metrics['readiness_1_5']:.3f}", "1-5"],
        ["resilience (среднее)", f"{metrics['resilience_1_5']:.3f}", "1-5"],
        ["scale (среднее)", f"{metrics['scale_1_5']:.3f}", "1-5"],
        ["Территориальные архетипы", metrics["territorial_archetypes"], "шт."],
        ["Capability groups", f"{metrics['capability_groups']} ({', '.join(metrics['capability_set'])})", "шт."],
        ["Лотов с public_core", metrics["public_core_lots"], "шт."],
    ]
    print(_table(["Показатель", "Значение", "Единица"], rows))
    print()
    print("  Напоминание: vpub и cash — разные контуры, складывать их нельзя;")
    print("  kcash — это только отношение cash/opex, а не прибыль, NPV или ROI.")
    print("  S не учитывает возврат C0, налоги и стоимость капитала; отрицательный S сам по себе не нарушает кейс.")


def _print_constraints(metrics, scenario: str) -> bool:
    rows = diagnose(metrics, scenario=scenario)
    table = [
        [
            row.code,
            row.title,
            f"{row.operator} {row.threshold:g}",
            f"{row.actual:.4f}".rstrip("0").rstrip(".") if row.unit != "шт." else f"{row.actual:.0f}",
            f"{row.slack:+.4f}".rstrip("0").rstrip(".") if row.operator != "==" else "—",
            "PASS" if row.passed else "FAIL",
        ]
        for row in rows
    ]
    print(_table(["Код", "Условие", "Порог", "Факт", "Запас", "Статус"], table))
    broken = failed(rows)
    if broken:
        print()
        print(f"  Нарушено ограничений: {len(broken)}")
        for row in broken:
            print(f"    • {row.title}: нужно {row.operator} {row.threshold:g}, фактически {row.actual:.4f}")
    return not broken


def _selection_from_args(args, decision) -> Tuple[List[Tuple[str, str]], str]:
    if args.portfolio is not None:
        selection = parse_selection(args.portfolio)
        if not selection:
            raise ValueError("Портфель не может быть пустым: укажите ЛОТ:РЕЖИМ через запятую")
        return selection, "аргумент --portfolio"
    return decision.recommended.selection, f"подбор по config: {decision.recommended.name}"


# --------------------------------------------------------------------------- #
# Команды
# --------------------------------------------------------------------------- #
def cmd_evaluate(args) -> int:
    decision = None if args.portfolio is not None else load_decision(args.config)
    selection, origin = _selection_from_args(args, decision)
    detail, metrics = evaluate(selection)

    print(f"Портфель: {format_selection(selection)}   ({origin})")
    print(f"SHA-256 входов кейса: {source_version()}")
    print()
    print(detail[["lot_id", "mode_id", "c0_mrub", "opex_mrub_per_year",
                  "vpub_mrub_per_year", "cash_mrub_per_year", "public_core"]].to_string(index=False))
    print()
    _print_metrics(metrics)

    targets = [args.scenario] if args.scenario else scenarios()
    ok_all = True
    for scenario in targets:
        print()
        print(f"=== Ограничения, сценарий {scenario} ===")
        ok_all = _print_constraints(metrics, scenario) and ok_all
    print()
    print("ИТОГ:", "все ограничения выполнены" if ok_all else "есть нарушения (см. выше)")
    return 0 if ok_all else 1


def cmd_compare(args) -> int:
    decision = load_decision(args.config)
    variants: List[Variant] = decision.variants
    identities, financial, quality = [], [], []
    for number, variant in enumerate(variants, start=1):
        _, metrics = evaluate(variant.selection)
        statuses = {}
        for scenario in scenarios():
            statuses[scenario] = "PASS" if all(r.passed for r in diagnose(metrics, scenario)) else "FAIL"
        identities.append([number, variant.name, format_selection(variant.selection)])
        financial.append([
            number,
            f"{metrics['c0_mrub']:.2f}",
            f"{metrics['opex_mrub_per_year']:.2f}",
            f"{metrics['cash_mrub_per_year']:.2f}",
            f"{metrics['cash_mrub_per_year'] - metrics['opex_mrub_per_year']:.2f}",
            f"{metrics['vpub_mrub_per_year']:.2f}",
            statuses.get("BASE", "—"),
            statuses.get("STRESS", "—"),
        ])
        quality.append([
            number,
            f"{metrics['readiness_1_5']:.4f}",
            f"{metrics['resilience_1_5']:.4f}",
            f"{metrics['scale_1_5']:.4f}",
            f"{metrics['kcash']:.3f}",
            f"{metrics['t_rep']:.4f}",
            metrics["public_core_lots"],
            metrics["territorial_archetypes"],
            metrics["capability_groups"],
        ])
    print(f"SHA-256 входов кейса: {source_version()}")
    print("Параметры подбора рекомендации:", json.dumps(decision.algorithm_parameters, ensure_ascii=False))
    print(_table(["№", "Вариант", "Состав и режимы"], identities))
    print()
    print("C0 — млн ₽; OPEX, CASH, S = CASH − OPEX и VPUB — млн ₽/год.")
    print(_table(["№", "C0", "OPEX", "CASH", "S", "VPUB", "BASE", "STRESS"], financial))
    print()
    print(_table(["№", "readiness_1_5", "resilience_1_5", "scale_1_5", "KCASH", "t_rep", "PC", "Территории", "Группы"], quality))
    print("  Индексы — средние баллы 1–5; PC — число лотов с public_core.")
    print("  BASE и STRESS проверяют один состав; меняется только официальный лимит C0.")
    print("  VPUB не складывается с CASH; KCASH и S не являются прибылью или окупаемостью.")
    return 0


def cmd_space(args) -> int:
    space = enumerate_space()
    print(f"Всего конфигураций: {len(space)}  (C(8,4)=70 наборов × 3^4=81 назначение режимов)")
    print()
    rows = []
    for scenario in scenarios():
        subset = feasible(scenario, space)
        rows.append([
            scenario,
            len(subset),
            f"{100.0 * len(subset) / len(space):.1f}%",
            subset["lots"].nunique() if len(subset) else 0,
        ])
    print(_table(["Сценарий", "Допустимо", "Доля", "Наборов лотов"], rows))

    print()
    print("=== Какие ограничения реально связывают решение (по BASE) ===")
    binding = binding_analysis(space)
    print(_table(
        ["Ограничение", "Провалов", "Доля", "Связывает"],
        [[r.constraint, r.failures, f"{r.share}%", "да" if r.binding else "НЕТ"]
         for r in binding.itertuples()],
    ))

    print()
    print("=== Частота лотов среди конфигураций, проходящих STRESS ===")
    stress = feasible("STRESS", space)
    print(_table(
        ["Лот", "Вхождений", "Доля"],
        [[r.lot_id, r.count, f"{100.0 * r.count / max(len(stress), 1):.0f}%"]
         for r in lot_frequency(stress).itertuples()],
    ))
    return 0


def cmd_pareto(args) -> int:
    from .hybrid import MAXIMIZE, MINIMIZE
    subset = feasible(args.scenario)
    subset["surplus"] = subset.cash - subset.opex
    front = pareto_front(subset, maximize=MAXIMIZE, minimize=MINIMIZE)
    print(f"Сценарий {args.scenario}: допустимо {len(subset)}, недоминируемых {len(front)}")
    print()
    top = front.sort_values("vpub", ascending=False).head(args.top)
    print(_table(
        ["Состав", "Режимы", "c0", "opex", "vpub", "kcash", "t_rep", "PC"],
        [[r.lots, r.modes, f"{r.c0:.1f}", f"{r.opex:.1f}", f"{r.vpub:.1f}",
          f"{r.kcash:.3f}", f"{r.t_rep:.3f}", r.public_core_lots] for r in top.itertuples()],
    ))
    return 0


def cmd_recommend(args) -> int:
    from .hybrid import Parameters, analyze
    # Читаем только входы: --delta переопределяет конфигурацию до единственного поиска.
    data = read_decision_config(args.config)
    parameters = dict(data["algorithm_parameters"])
    if args.delta is not None:
        parameters["cash_loss_limit_mrub"] = args.delta
    if args.base_only:
        parameters["require_stress"] = False
    _, _, result = analyze(Parameters(**parameters))
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    return 0 if result["winner"] else 2


def cmd_export(args) -> int:
    from .export_integrity import CONFIG_NAME, EXPORT_FILES, LEGACY_FILES, write_export_provenance
    from .export_report import build_report

    decision = load_decision(args.config)
    detail, metrics = evaluate(decision.recommended.selection)
    report = build_report(decision, metrics)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    # Сохраняем слепок для безопасного сравнения документов после нового экспорта.
    previous = RESULTS_DIR / CONFIG_NAME
    document_values = json.loads(previous.read_text()).get("document_values", {}) if previous.exists() else {}
    legacy_snapshot = RESULTS_DIR / "document_facts.json"
    if not document_values and legacy_snapshot.exists():
        document_values = json.loads(legacy_snapshot.read_text())
    configuration = dict(decision.as_export(), document_values=document_values)
    detail.to_csv(RESULTS_DIR / "portfolio_detail.csv", index=False, encoding="utf-8")
    for name, value in (("portfolio_metrics.json", metrics), (CONFIG_NAME, configuration),
                        ("hybrid_analysis.json", report)):
        (RESULTS_DIR / name).write_text(
            json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    write_export_provenance(RESULTS_DIR, args.config)
    # Только известные артефакты прежнего формата, не произвольные файлы пользователя.
    for name in LEGACY_FILES:
        (RESULTS_DIR / name).unlink(missing_ok=True)
    print(f"Записано в {RESULTS_DIR}:")
    for name in EXPORT_FILES:
        print("  •", name)
    return 0


def cmd_sensitivity(args) -> int:
    decision = None if args.portfolio is not None else load_decision(args.config)
    selection, origin = _selection_from_args(args, decision)
    scenario = args.scenario

    print(f"Портфель: {format_selection(selection)}   ({origin})")
    print(f"Сценарий: {scenario}")
    print()
    print("=== Насколько могут измениться входные данные, пока портфель допустим ===")
    rows = input_headroom(selection, scenario)
    print(_table(
        ["Вход", "Направление", "Предельный множитель", "Запас", "Упирается в"],
        [[r.input_name, r.direction, f"{r.limit_factor:.4f}",
          f"{r.change_pct:.1f}%", r.binding] for r in rows],
    ))
    print()
    narrow = binding_first(selection, scenario)
    print(f"  Самое узкое место: {narrow.input_name} — "
          f"{narrow.direction} на {narrow.change_pct:.1f}% упирается в {narrow.binding}.")

    print()
    print("=== Запас до нулевого остатка (порог команды, не ограничение кейса) ===")
    print(_table(
        ["Вход", "Направление", "Предельный множитель", "Запас", "Упирается в"],
        [[r.input_name, r.direction, f"{r.limit_factor:.4f}",
          f"{r.change_pct:.1f}%", r.binding] for r in surplus_headroom(selection)],
    ))

    print()
    print("=== Граница по лимиту стартовых затрат ===")
    point = c0_breaking_point(selection)
    print(_table(
        ["Показатель", "Значение"],
        [
            ["c0 портфеля", f"{point['portfolio_c0']:.2f} млн ₽"],
            ["Лимит BASE", f"{point['base_limit']} млн ₽"],
            ["Лимит STRESS", f"{point['stress_limit']} млн ₽"],
            ["Запас в STRESS", f"{point['stress_slack']:.2f} млн ₽"],
            ["Ломается при лимите ниже", f"{point['breaks_below_limit']:.2f} млн ₽"],
            ["Допустимое доп. сокращение лимита", f"{point['extra_cut_allowed_pct']:.2f}%"],
        ],
    ))
    print()
    print("  Исходные файлы кейса при этом не изменяются: запас считается по уже")
    print("  рассчитанным показателям, а не подкруткой lots.csv.")
    return 0


# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python run.py" if __package__ == "engine" else f"python -m {__package__}",
        description="Расчётный инструмент кейса «Космос как инфраструктура».",
    )
    parser.add_argument("--config", type=Path, default=None,
                        help="путь к config/decision.json (по умолчанию — репозиторный)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_rec = sub.add_parser("recommend", help="единственный гибридный подбор; JSON с Q, шкалами и точками смены")
    p_rec.add_argument("--delta", type=float, default=None, help="явный Δ, млн ₽/год; без флага — параметр из конфига")
    p_rec.add_argument("--base-only", action="store_true", help="область BASE без обязательного STRESS")
    p_rec.set_defaults(func=cmd_recommend)

    p_check = sub.add_parser("selfcheck", help="проверка воспроизводимости и контрольных результатов")
    p_check.set_defaults(func=lambda _args: print(json.dumps(run_selfcheck(), ensure_ascii=False)))

    p_eval = sub.add_parser("evaluate", help="расчёт портфеля и проверка ограничений")
    p_eval.add_argument("--portfolio", help="например FIRE:A,AGRI:A,TRANS:B,ENV:A")
    p_eval.add_argument("--scenario", choices=["BASE", "STRESS"], default=None,
                        help="по умолчанию считаются оба сценария")
    p_eval.set_defaults(func=cmd_evaluate)

    p_cmp = sub.add_parser("compare", help="сравнение вариантов из конфига")
    p_cmp.set_defaults(func=cmd_compare)

    p_space = sub.add_parser("space", help="полный перебор: допустимость и связывающие ограничения")
    p_space.set_defaults(func=cmd_space)

    p_par = sub.add_parser("pareto", help="недоминируемые конфигурации")
    p_par.add_argument("--scenario", choices=["BASE", "STRESS"], default="STRESS")
    p_par.add_argument("--top", type=int, default=15)
    p_par.set_defaults(func=cmd_pareto)

    p_sens = sub.add_parser("sensitivity", help="запас по входным данным и граница слома")
    p_sens.add_argument("--portfolio", help="например FIRE:A,AGRI:A,TRANS:B,ENV:A")
    p_sens.add_argument("--scenario", choices=["BASE", "STRESS"], default="STRESS")
    p_sens.set_defaults(func=cmd_sensitivity)

    p_exp = sub.add_parser("export", help="выгрузка контрольных результатов в results/")
    p_exp.set_defaults(func=cmd_export)
    return parser


def main(argv: Sequence[str] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(f"Ошибка входов: {error}")
        return 2
