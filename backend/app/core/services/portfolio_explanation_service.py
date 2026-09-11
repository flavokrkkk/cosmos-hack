import re
from collections.abc import Awaitable, Callable
from uuid import UUID

from app.core.dto.ollama import PortfolioExplanationDraft
from app.core.dto.portfolio import (
    Calculation,
    EvaluateRequest,
    ExplanationFact,
    ExplanationJob,
    ExplanationJobCreated,
    ExplanationPoint,
    PortfolioExplanation,
    PortfolioExplanationRequest,
    PortfolioExplanationResult,
)
from app.core.repositories.portfolio_explanation_repository import PortfolioExplanationRepository
from app.core.services.ollama_service import OllamaService
from app.core.services.portfolio_service import PortfolioService
from app.infrastructure.errors.ollama_errors import OllamaError, OllamaResponseError
from app.infrastructure.errors.portfolio_errors import (
    ExplanationJobNotFound,
    ExplanationQueueUnavailable,
)


EnqueueExplanation = Callable[[UUID], Awaitable[None]]


class PortfolioExplanationService:
    def __init__(
        self,
        repository: PortfolioExplanationRepository,
        enqueue: EnqueueExplanation | None = None,
    ) -> None:
        self._repository = repository
        self._enqueue = enqueue

    async def create(self, request: PortfolioExplanationRequest) -> ExplanationJobCreated:
        calculation = PortfolioService().evaluate(
            EvaluateRequest(dataset_hash=request.dataset_hash, selection=request.selection),
        )
        job = await self._repository.add(
            status="queued",
            request=request.model_dump(mode="json"),
            calculation_input_hash=calculation.input_hash,
        )
        try:
            if self._enqueue is None:
                from app.tasks.portfolio_explanation import generate_portfolio_explanation

                await generate_portfolio_explanation.kiq(str(job.id))
            else:
                await self._enqueue(job.id)
        except Exception as error:
            await self._repository.update_item(
                job.id,
                status="failed",
                error="Не удалось поставить задачу в очередь",
            )
            raise ExplanationQueueUnavailable() from error
        return ExplanationJobCreated(id=job.id, status="queued")

    async def get(self, job_id: UUID) -> ExplanationJob:
        job = await self._repository.get_item(job_id)
        if job is None:
            raise ExplanationJobNotFound()
        return ExplanationJob(
            id=job.id,
            status=job.status,
            created_at=job.created_at,
            updated_at=job.updated_at,
            result=job.result,
            error=job.error,
        )

    async def run(self, job_id: UUID, ollama: OllamaService) -> None:
        job = await self._repository.get_item(job_id)
        if job is None:
            raise ExplanationJobNotFound()
        await self._repository.update_item(job.id, status="running", error=None)
        try:
            request = PortfolioExplanationRequest.model_validate(job.request)
            calculation = PortfolioService().evaluate(
                EvaluateRequest(dataset_hash=request.dataset_hash, selection=request.selection),
            )
            facts = _build_facts(calculation, request.scenario)
            generated_by = "ollama"
            warning = None
            model = None
            try:
                draft, response = await ollama.explain_portfolio(
                    [fact.model_dump() for fact in facts],
                )
                explanation = _validate_explanation(draft, facts)
                model = response.model
            except OllamaError:
                generated_by = "template"
                warning = "Ollama недоступен или вернул некорректный ответ; показан шаблонный текст."
                explanation = _template_explanation(calculation, request.scenario, facts)

            result = PortfolioExplanationResult(
                calculation=calculation,
                scenario=request.scenario,
                facts=facts,
                explanation=explanation,
                model=model,
                generated_by=generated_by,
                warning=warning,
            )
            await self._repository.update_item(
                job.id,
                status="succeeded",
                result=result.model_dump(mode="json"),
                error=None,
            )
        except Exception as error:
            await self._repository.update_item(
                job.id,
                status="failed",
                error="Не удалось сформировать объяснение портфеля",
            )
            raise error


def _build_facts(calculation: Calculation, scenario: str) -> list[ExplanationFact]:
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
            source="case",
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
    scenario: str,
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
