from app.core.dto.ollama import EvidenceSelection
from app.core.dto.portfolio import Calculation, ExplanationFact, ExplanationPoint, PortfolioExplanation, Scenario
from app.infrastructure.errors.ollama_errors import OllamaResponseError


def number(value: float, precision: int = 2) -> str:
    return f"{value:,.{precision}f}".replace(",", " ").rstrip("0").rstrip(".").replace(".", ",")


def portfolio_evidence(calculation: Calculation, scenario: Scenario) -> list[ExplanationFact]:
    metrics = calculation.metrics
    if metrics is None:
        return []
    budget = next(check for check in calculation.checks[scenario] if check.code == "c0_limit")
    cash_delta = metrics.cash_mrub_per_year - metrics.opex_mrub_per_year
    facts = [
        ExplanationFact(id="budget", source="calculation", kind="strength" if budget.passed else "limitation", text=(
            f"Запуск стоит {number(metrics.c0_mrub)} млн ₽ при лимите {number(budget.threshold)} млн ₽ в {scenario}. "
            + (f"Запас бюджета — {number(budget.slack)} млн ₽." if budget.passed else f"Превышение — {number(-budget.slack)} млн ₽.")
        )),
        ExplanationFact(id="cash_balance", source="calculation", kind="strength" if cash_delta >= 0 else "limitation", text=(
            f"Поступления — {number(metrics.cash_mrub_per_year)} млн ₽/год, расходы — {number(metrics.opex_mrub_per_year)} млн ₽/год. "
            + (f"Поступления покрывают расходы с остатком {number(cash_delta)} млн ₽/год." if cash_delta >= 0 else f"Для полного покрытия расходов не хватает {number(-cash_delta)} млн ₽/год.")
        )),
        ExplanationFact(id="public_value", source="calculation", kind="context", text=(
            f"Общественная ценность по модели кейса — {number(metrics.vpub_mrub_per_year)} млн ₽/год. Это оценка пользы, а не денежные поступления."
        )),
        ExplanationFact(id="public_core", source="calculation", kind="context", text=(
            f"В общественном режиме работают {metrics.public_core_lots} из {metrics.selected_lots} сервисов."
        )),
        ExplanationFact(id="portfolio_status", source="calculation", kind="context", text=(
            f"Портфель {'проходит' if calculation.feasible_by_scenario[scenario] else 'не проходит'} все обязательные ограничения {scenario}."
        )),
    ]
    financial = calculation.financial
    if financial and financial.operating_self_financed:
        facts.append(ExplanationFact(id="operating_headroom", source="calculation", kind="context", text=(
            f"При неизменных остальных условиях поступления могут снизиться на {number(financial.cash_drop_break_even_pct)}%, "
            f"либо расходы вырасти на {number(financial.opex_growth_break_even_pct)}%, прежде чем годовой остаток станет отрицательным. "
            "Это два отдельных порога, не одновременный стресс и не гарантия устойчивости."
        )))
    for check in calculation.checks[scenario]:
        if not check.passed:
            facts.append(ExplanationFact(id=f"failed_{check.code}", source="calculation", kind="limitation", text=(
                f"Не выполнено условие «{check.title}»: {number(check.actual)} при требовании {check.operator} {number(check.threshold)} {check.unit}."
            )))
    losses = [row for row in calculation.detail if row.cash_mrub_per_year < row.opex_mrub_per_year]
    if losses:
        facts.append(ExplanationFact(id="lot_deficits", source="calculation", kind="limitation", text=(
            "У отдельных сервисов поступления ниже ежегодных расходов: "
            + "; ".join(f"{row.lot_id} — дефицит {number(row.opex_mrub_per_year - row.cash_mrub_per_year)} млн ₽/год" for row in losses)
            + ". Общая сумма портфеля сама по себе не задаёт механизм покрытия этих дефицитов."
        )))
    facts.append(ExplanationFact(id="scope_limit", source="system", kind="limitation", text=(
        "Расчёт не определяет, кто оплачивает сервисы и как заключаются договоры: финансовую и договорную схему нужно обосновать отдельно."
    )))
    return facts


def render_evidence(headline: str, facts: list[ExplanationFact], selection: EvidenceSelection | None = None) -> PortfolioExplanation:
    by_id = {fact.id: fact for fact in facts}
    if selection is None:
        summary_ids = [fact.id for fact in facts if fact.id in {"budget", "cash_balance"}]
        if not summary_ids:
            summary_ids = [fact.id for fact in facts if fact.source == "calculation" and not fact.id.endswith("status")][:2]
        strength_ids = [fact.id for fact in facts if fact.kind == "strength"][:2]
        limitation_ids = [fact.id for fact in sorted(facts, key=lambda fact: fact.source != "calculation") if fact.kind == "limitation"][:2]
    else:
        summary_ids, strength_ids, limitation_ids = selection.summary_ids, selection.strength_ids, selection.limitation_ids
        for ids, kind in ((summary_ids, None), (strength_ids, "strength"), (limitation_ids, "limitation")):
            if len(set(ids)) != len(ids) or any(key not in by_id for key in ids):
                raise OllamaResponseError("Unknown or duplicate evidence references")
            if kind and any(by_id[key].kind != kind for key in ids):
                raise OllamaResponseError("Evidence placed in the wrong section")
            if kind and not ids and any(fact.kind == kind for fact in facts):
                raise OllamaResponseError("Evidence section is empty despite available facts")
        if not any(by_id[key].source == "calculation" and not key.endswith("status") for key in summary_ids):
            raise OllamaResponseError("Summary has no concrete calculation evidence")
    summary = selection.narrative if selection is not None else " ".join(by_id[key].text for key in summary_ids)
    return PortfolioExplanation(
        headline=headline,
        summary=summary,
        strengths=[ExplanationPoint(text=by_id[key].text, fact_ids=[key]) for key in strength_ids],
        limitations=[ExplanationPoint(text=by_id[key].text, fact_ids=[key]) for key in limitation_ids],
    )
