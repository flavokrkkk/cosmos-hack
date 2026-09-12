import re

from app.core.dto.ollama import PortfolioExplanationDraft
from app.core.dto.portfolio import (
    Calculation,
    EvaluateRequest,
    ExplanationFact,
    ExplanationPoint,
    PortfolioExplanation,
    PortfolioExplanationRequest,
    PortfolioExplanationResult,
    Scenario,
)
from app.core.services.ollama_service import OllamaService
from app.core.services.portfolio_service import PortfolioService
from app.infrastructure.errors.ollama_errors import OllamaError, OllamaResponseError
from app.infrastructure.logging.logger import get_logger


logger = get_logger(__name__)


class PortfolioExplanationService:
    async def explain(
        self,
        request: PortfolioExplanationRequest,
        ollama: OllamaService,
    ) -> PortfolioExplanationResult:
        calculation = PortfolioService().evaluate(
            EvaluateRequest(dataset_hash=request.dataset_hash, selection=request.selection),
        )
        facts = _build_facts(calculation, request.scenario)
        generated_by = "ollama"
        warning = None
        model = None
        try:
            draft, response = await ollama.explain_portfolio(
                [fact.model_dump(exclude={"kind"}) for fact in facts],
            )
            explanation = _validate_explanation(draft, facts)
            model = response.model
        except OllamaError as error:
            logger.warning(
                "portfolio_explanation_fallback",
                calculation_input_hash=calculation.input_hash,
                error_type=type(error).__name__,
                reason=str(error),
            )
            generated_by = "template"
            warning = "Ollama недоступен или вернул некорректный ответ; показан шаблонный текст."
            explanation = _template_explanation(calculation, request.scenario, facts)

        return PortfolioExplanationResult(
            calculation=calculation,
            scenario=request.scenario,
            facts=facts,
            explanation=explanation,
            model=model,
            generated_by=generated_by,
            warning=warning,
        )


def _build_facts(calculation: Calculation, scenario: Scenario) -> list[ExplanationFact]:
    catalog = PortfolioService().catalog()
    lot_titles = {lot.lot_id: lot.title for lot in catalog.lots}
    facts = [
        ExplanationFact(
            id=f"lot_{item.lot_id}",
            text=f"В портфель включён сервис «{lot_titles[item.lot_id]}» в режиме {item.mode_id}.",
            source="calculation",
        )
        for item in calculation.selection
    ]
    scenario_passed = calculation.feasible_by_scenario[scenario]
    facts.append(
        ExplanationFact(
            id="portfolio_status",
            text=(
                f"Портфель {'проходит' if scenario_passed else 'не проходит'} "
                f"все обязательные ограничения сценария {scenario}."
            ),
            source="calculation",
        ),
    )
    for check in calculation.checks[scenario]:
        facts.append(
            ExplanationFact(
                id=f"check_{check.code}",
                text=f"Условие «{check.title}» {'выполнено' if check.passed else 'не выполнено'}.",
                source="calculation",
            ),
        )
    facts.append(
        ExplanationFact(
            id="scope_limit",
            text=(
                "Расчёт проверяет состав, режимы и ограничения портфеля, но не определяет "
                "юридическую схему, плательщиков и конкретных исполнителей."
            ),
            source="system",
        ),
    )
    return facts


def _validate_explanation(
    draft: PortfolioExplanationDraft,
    facts: list[ExplanationFact],
) -> PortfolioExplanation:
    allowed_ids = {fact.id for fact in facts}
    all_text = [draft.headline, draft.summary]
    points = [*draft.strengths, *draft.limitations]
    if not points:
        raise OllamaResponseError("Ollama вернул пустое объяснение")
    for point in points:
        if not point.fact_ids or not set(point.fact_ids) <= allowed_ids:
            raise OllamaResponseError("Ollama сослался на неизвестные факты")
        all_text.append(point.text)
    if any(re.search(r"\d", text) for text in all_text):
        raise OllamaResponseError("Ollama добавил числовые значения")
    return PortfolioExplanation(
        headline=draft.headline,
        summary=draft.summary,
        strengths=[ExplanationPoint(**point.model_dump()) for point in draft.strengths],
        limitations=[ExplanationPoint(**point.model_dump()) for point in draft.limitations],
    )


def _template_explanation(
    calculation: Calculation,
    scenario: Scenario,
    facts: list[ExplanationFact],
) -> PortfolioExplanation:
    fact_by_id = {fact.id: fact for fact in facts}
    passed_ids = [
        f"check_{check.code}" for check in calculation.checks[scenario] if check.passed
    ]
    failed_ids = [
        f"check_{check.code}" for check in calculation.checks[scenario] if not check.passed
    ]
    status = calculation.feasible_by_scenario[scenario]
    strengths = [
        ExplanationPoint(text=fact_by_id[fact_id].text, fact_ids=[fact_id])
        for fact_id in passed_ids[:3]
    ]
    limitation_ids = failed_ids[:3] or ["scope_limit"]
    limitations = [
        ExplanationPoint(text=fact_by_id[fact_id].text, fact_ids=[fact_id])
        for fact_id in limitation_ids
    ]
    return PortfolioExplanation(
        headline="Портфель проходит проверку" if status else "Портфель требует корректировки",
        summary=fact_by_id["portfolio_status"].text,
        strengths=strengths,
        limitations=limitations,
    )
