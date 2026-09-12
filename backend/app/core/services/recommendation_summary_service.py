import asyncio
from collections import OrderedDict
from time import monotonic

from starlette.concurrency import run_in_threadpool

from app.core.dto.portfolio import ExplanationFact, RecommendRequest, RecommendationExplanation, RecommendationResult
from app.core.services.ollama_service import OllamaService
from app.core.services.explanation_evidence import portfolio_evidence, render_evidence, number
from app.core.services.portfolio_service import input_hash
from app.core.services.recommendation_service import RecommendationService
from app.infrastructure.errors.ollama_errors import OllamaError, OllamaResponseError
from app.infrastructure.logging.logger import get_logger


logger = get_logger(__name__)
PROMPT_VERSION = "recommend-narrative-v5"


class RecommendationSummaryService:
    def __init__(self, timeout_seconds: float = 95) -> None:
        self._timeout = timeout_seconds
        self._cache: OrderedDict[str, tuple[float, RecommendationResult]] = OrderedDict()
        self._pending: dict[str, asyncio.Task] = {}
        self._slot = asyncio.Semaphore(1)

    async def recommend(self, request: RecommendRequest, ollama: OllamaService) -> RecommendationResult:
        result = await run_in_threadpool(RecommendationService().recommend, request)
        if result.status == "no_feasible":
            return result
        key = input_hash({"result": result.model_dump(), "model": ollama.model, "prompt": PROMPT_VERSION})
        cached = self._cache.get(key)
        if cached and cached[0] > monotonic():
            self._cache.move_to_end(key)
            return cached[1].model_copy(deep=True)
        task = self._pending.get(key)
        if task is None:
            task = asyncio.create_task(self._generate(key, result, ollama))
            self._pending[key] = task
        return (await asyncio.shield(task)).model_copy(deep=True)

    async def close(self) -> None:
        tasks = list(self._pending.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _generate(self, key: str, result: RecommendationResult, ollama: OllamaService) -> RecommendationResult:
        try:
            variants = [v for v in [result.recommended, *result.alternatives] if v is not None]
            scenario = "STRESS" if result.request.require_stress else "BASE"
            facts_by_key = {}
            for index, variant in enumerate(variants):
                facts = portfolio_evidence(variant.calculation, scenario)
                for metric, label in (("c0_mrub", "Стартовые затраты"), ("vpub_mrub_per_year", "Общественная ценность"), ("kcash", "Покрытие расходов"), ("t_rep", "Тиражируемость")):
                    value = getattr(variant.calculation.metrics, metric)
                    others = [getattr(v.calculation.metrics, metric) for v in variants]
                    if min(others) == max(others):
                        continue
                    lower_is_better = metric == "c0_mrub"
                    best = min(others) if lower_is_better else max(others)
                    unit = " млн ₽" if metric == "c0_mrub" else " млн ₽/год" if metric == "vpub_mrub_per_year" else ""
                    precision = 2 if unit else 4
                    if value == best:
                        text = f"{label} — {number(value, precision)}{unit}: {'наименьшее' if lower_is_better else 'наибольшее'} значение среди показанных вариантов (возможны совпадения)."
                    else:
                        text = f"{label} — {number(value, precision)}{unit}; среди показанных вариантов есть {'меньшее' if lower_is_better else 'большее'} значение — {number(best, precision)}{unit}."
                    facts.append(ExplanationFact(id=f"comparison_{metric}", text=text, source="calculation", kind="strength" if value == best else "limitation"))
                facts_by_key[f"v{index}"] = facts
            explanations = {}
            model = None
            warning = None
            try:
                # Время ожидания занятой модели тоже входит в предел HTTP-запроса.
                async with asyncio.timeout(self._timeout):
                    async with self._slot:
                        draft, response = await ollama.select_evidence([
                            {"key": item_key, "facts": [fact.model_dump() for fact in facts]}
                            for item_key, facts in facts_by_key.items()
                        ])
                keys = [item.key for item in draft.items]
                if len(keys) != len(set(keys)) or set(keys) != set(facts_by_key):
                    raise OllamaResponseError("Ollama returned missing, duplicate or unknown portfolio keys")
                titles = {f"v{index}": variant.title for index, variant in enumerate(variants)}
                explanations = {item.key: render_evidence(titles[item.key], facts_by_key[item.key], item) for item in draft.items}
                model = response.model
            except (OllamaError, TimeoutError) as error:
                logger.warning("recommendation_summary_fallback", reason=str(error), input_hash=result.input_hash)
                warning = "Пакетное объяснение Ollama недоступно; показан шаблон по расчёту. Повторите подбор позже."
            for index, variant in enumerate(variants):
                item_key = f"v{index}"
                variant.explanation = RecommendationExplanation(
                    input_hash=variant.calculation.input_hash,
                    scenario=scenario,
                    facts=facts_by_key[item_key],
                    explanation=explanations.get(item_key) or render_evidence(variant.title, facts_by_key[item_key]),
                    model=model,
                    generated_by="ollama" if explanations else "template",
                    warning=warning,
                    composition="generative" if explanations else "extractive",
                )
            # Сбой не закрепляем надолго: следующий подбор сможет повторить генерацию.
            self._cache[key] = (monotonic() + (86400 if explanations else 15), result)
            self._cache.move_to_end(key)
            while len(self._cache) > 128:
                self._cache.popitem(last=False)
            return result
        finally:
            self._pending.pop(key, None)
