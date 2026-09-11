import asyncio
from collections import OrderedDict
from time import monotonic

from starlette.concurrency import run_in_threadpool

from app.core.dto.portfolio import (
    CompareRequest, ComparisonAnalysisRequest, ComparisonAnalysisResult, ComparisonResult,
    ExplanationFact, ExplanationPoint, PortfolioExplanation, Scenario,
)
from app.core.services.ollama_service import OllamaService
from app.core.services.portfolio_explanation_service import _validate_explanation
from app.core.services.portfolio_service import PortfolioService, input_hash
from app.infrastructure.errors.ollama_errors import OllamaError
from app.infrastructure.logging.logger import get_logger


logger = get_logger(__name__)
VARIANT_LABELS = ("Первый вариант", "Второй вариант", "Третий вариант", "Четвёртый вариант")
METRICS = (
    ("c0_mrub", "Стартовые затраты"),
    ("opex_mrub_per_year", "Ежегодные расходы"),
    ("vpub_mrub_per_year", "Общественная ценность"),
    ("kcash", "Покрытие расходов"),
    ("t_rep", "Тиражируемость"),
)


def comparison_facts(comparison: ComparisonResult, scenario: Scenario) -> list[ExplanationFact]:
    facts = [ExplanationFact(id="scope", source="system", text=(
        "Первый вариант — база сравнения, не победитель. У показателей нет общего балла. "
        "Расчёт не определяет плательщиков, договоры и исполнителей."
    ))]
    for index, variant in enumerate(comparison.variants):
        label = VARIANT_LABELS[index]
        passed = variant.feasible_by_scenario[scenario]
        facts.append(ExplanationFact(id=f"v{index}_status", source="calculation", text=(
            f"{label} {'проходит' if passed else 'не проходит'} ограничения {scenario}. "
            + ("Нарушены: " + ", ".join(check.title for check in variant.checks[scenario] if not check.passed) if not passed else "")
        )))
        if index == comparison.baseline_index:
            continue
        for metric, title in METRICS:
            delta = comparison.deltas[index][metric]
            relation = "выше" if delta > 0 else "ниже" if delta < 0 else "такой же"
            better = delta < 0 if metric in {"c0_mrub", "opex_mrub_per_year"} else delta > 0
            verdict = "без различий" if delta == 0 else "преимущество по этому показателю" if better else "компромисс по этому показателю"
            facts.append(ExplanationFact(id=f"v{index}_{metric}", source="calculation", text=(
                f"{label}: показатель «{title}» — {relation}, чем у первого варианта; {verdict}."
            )))
    return facts


class ComparisonAnalysisService:
    def __init__(self) -> None:
        self._cache: OrderedDict[str, tuple[float, ComparisonAnalysisResult]] = OrderedDict()
        self._lock = asyncio.Lock()

    async def analyze(self, request: ComparisonAnalysisRequest, ollama: OllamaService) -> ComparisonAnalysisResult:
        comparison = await run_in_threadpool(PortfolioService().compare, CompareRequest(variants=request.variants))
        calculation_hash = input_hash({"comparison": comparison.model_dump(), "scenario": request.scenario})
        key = input_hash({"input": calculation_hash, "model": ollama.model, "prompt": "comparison-v2"})
        facts = comparison_facts(comparison, request.scenario)
        try:
            async with asyncio.timeout(65):
                async with self._lock:
                    cached = self._cache.get(key)
                    if cached and cached[0] > monotonic():
                        self._cache.move_to_end(key)
                        return cached[1].model_copy(deep=True)
                    draft, response = await ollama.analyze_comparison([fact.model_dump() for fact in facts])
                    explanation = _validate_explanation(draft, facts)
                    model = response.model
                    result = ComparisonAnalysisResult(
                        comparison=comparison, input_hash=calculation_hash, scenario=request.scenario,
                        facts=facts, explanation=explanation, model=model, generated_by="ollama",
                    )
                    self._remember(key, result, 86400)
                    return result.model_copy(deep=True)
        except (OllamaError, TimeoutError) as error:
            logger.warning("comparison_analysis_fallback", reason=str(error) or type(error).__name__)
            warning = "Анализ Ollama недоступен; показаны факты сравнения без генерации AI."
        result = ComparisonAnalysisResult(
            comparison=comparison, input_hash=calculation_hash, scenario=request.scenario, facts=facts,
            explanation=PortfolioExplanation(
                headline="Сравнение по расчётным показателям",
                summary="Первый вариант используется как база. Различия приведены в таблице; универсальный победитель не назначается.",
                strengths=[ExplanationPoint(text=fact.text, fact_ids=[fact.id]) for fact in facts if fact.id.endswith("_status")],
                limitations=[ExplanationPoint(text=facts[0].text, fact_ids=["scope"])],
            ), model=None, generated_by="template", warning=warning,
        )
        self._remember(key, result, 15)
        return result.model_copy(deep=True)

    def _remember(self, key: str, result: ComparisonAnalysisResult, ttl: int) -> None:
        self._cache[key] = (monotonic() + ttl, result)
        self._cache.move_to_end(key)
        while len(self._cache) > 128:
            self._cache.popitem(last=False)
