"""Командный интерфейс расчётного инструмента.

Позволяет эксперту воспроизвести все числа записки, не редактируя исходный код:
портфель и альтернативы берутся из `config/decision.json` либо передаются флагом
`--portfolio`, сценарий — флагом `--scenario` (критерии Т2, Т5).

Примеры:

    python -m engine evaluate
    python -m engine evaluate --portfolio FIRE:A,AGRI:A,TRANS:B,ENV:A --scenario STRESS
    python -m engine compare
    python -m engine space
    python -m engine pareto --scenario STRESS --top 15
    python -m engine export
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Sequence, Tuple

from .canonical import REPO_ROOT, evaluate, scenarios
from .constraints import diagnose, failed
from .decision import Variant, load_decision
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
    if args.portfolio:
        return parse_selection(args.portfolio), "аргумент --portfolio"
    return decision.recommended.selection, f"config: {decision.recommended.name}"


# --------------------------------------------------------------------------- #
# Команды
# --------------------------------------------------------------------------- #
def cmd_evaluate(args) -> int:
    decision = load_decision(args.config)
    selection, origin = _selection_from_args(args, decision)
    detail, metrics = evaluate(selection)

    print(f"Портфель: {format_selection(selection)}   ({origin})")
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
    rows = []
    for variant in variants:
        _, metrics = evaluate(variant.selection)
        statuses = {}
        for scenario in scenarios():
            statuses[scenario] = "PASS" if all(r.passed for r in diagnose(metrics, scenario)) else "FAIL"
        rows.append([
            variant.name,
            format_selection(variant.selection),
            f"{metrics['c0_mrub']:.1f}",
            f"{metrics['opex_mrub_per_year']:.1f}",
            f"{metrics['vpub_mrub_per_year']:.1f}",
            f"{metrics['kcash']:.3f}",
            f"{metrics['t_rep']:.3f}",
            metrics["public_core_lots"],
            statuses.get("BASE", "—"),
            statuses.get("STRESS", "—"),
        ])
    print(_table(
        ["Вариант", "Состав", "c0", "opex", "vpub", "kcash", "t_rep", "PC", "BASE", "STRESS"],
        rows,
    ))
    print()
    print("  PC — число лотов в режиме с public_core (порог 2).")
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
    subset = feasible(args.scenario)
    front = pareto_front(subset)
    print(f"Сценарий {args.scenario}: допустимо {len(subset)}, недоминируемых {len(front)}")
    print()
    top = front.sort_values("vpub", ascending=False).head(args.top)
    print(_table(
        ["Состав", "Режимы", "c0", "opex", "vpub", "kcash", "t_rep", "PC"],
        [[r.lots, r.modes, f"{r.c0:.1f}", f"{r.opex:.1f}", f"{r.vpub:.1f}",
          f"{r.kcash:.3f}", f"{r.t_rep:.3f}", r.public_core_lots] for r in top.itertuples()],
    ))
    return 0


def cmd_export(args) -> int:
    decision = load_decision(args.config)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    detail, metrics = evaluate(decision.recommended.selection)
    detail.to_csv(RESULTS_DIR / "portfolio_detail.csv", index=False, encoding="utf-8")
    with open(RESULTS_DIR / "portfolio_metrics.json", "w", encoding="utf-8") as handle:
        json.dump(metrics, handle, ensure_ascii=False, indent=2)
    with open(RESULTS_DIR / "team_decision_config.json", "w", encoding="utf-8") as handle:
        json.dump(decision.as_export(), handle, ensure_ascii=False, indent=2)

    for scenario in scenarios():
        rows = [row.as_dict() for row in diagnose(metrics, scenario)]
        import pandas as pd

        pd.DataFrame(rows).to_csv(
            RESULTS_DIR / f"constraints_{scenario}.csv", index=False, encoding="utf-8"
        )

    space = enumerate_space()
    space.to_csv(RESULTS_DIR / "portfolio_space.csv", index=False, encoding="utf-8")

    written = sorted(p.name for p in RESULTS_DIR.iterdir() if p.is_file())
    print(f"Записано в {RESULTS_DIR}:")
    for name in written:
        print("  •", name)
    return 0


# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m engine",
        description="Расчётный инструмент кейса «Космос как инфраструктура».",
    )
    parser.add_argument("--config", type=Path, default=None,
                        help="путь к config/decision.json (по умолчанию — репозиторный)")
    sub = parser.add_subparsers(dest="command", required=True)

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

    p_exp = sub.add_parser("export", help="выгрузка контрольных результатов в results/")
    p_exp.set_defaults(func=cmd_export)
    return parser


def main(argv: Sequence[str] = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)
