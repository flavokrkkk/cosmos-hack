import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app.api.v1.dependencies import get_ollama_service, get_recommendation_summary_service
from app.core.dto.ollama import BatchExplanationDraft, OllamaChatResult
from app.core.dto.portfolio import RecommendRequest
from app.core.services.ollama_service import OllamaService
from app.core.services.portfolio_service import PortfolioService
from app.core.services.recommendation_service import RecommendationService
from app.core.services.recommendation_summary_service import RecommendationSummaryService
from app.infrastructure.errors.ollama_errors import OllamaUnavailableError
from app.main import app


def request(stress=True):
    return RecommendRequest(dataset_hash=PortfolioService().catalog().dataset_hash, require_stress=stress)


def variants(result):
    return [v for v in [result.recommended, *result.alternatives] if v is not None]


class FakeBatch:
    model = "test-batch"

    def __init__(self, failure=None):
        self.calls = []
        self.failure = failure

    async def explain_portfolios(self, portfolios):
        self.calls.append(portfolios)
        if self.failure == "offline":
            raise OllamaUnavailableError("offline")
        if self.failure == "timeout":
            await asyncio.Event().wait()
        items = [
            {
                "key": p["key"],
                "headline": title,
                "summary": "Компромисс основан на расчёте.",
                "strengths": [{"text": "Условия выполнены.", "fact_ids": ["portfolio_status"]}],
                "limitations": [{"text": "Договоры определяются отдельно.", "fact_ids": ["scope_limit"]}],
            }
            for p, title in zip(portfolios, ["Первый", "Второй", "Третий", "Четвёртый", "Пятый"])
        ]
        if self.failure == "missing":
            items.pop()
        elif self.failure == "duplicate":
            items[-1]["key"] = items[0]["key"]
        elif self.failure == "unknown":
            items[0]["key"] = "unknown"
        elif self.failure == "invented_fact":
            items[0]["strengths"][0]["fact_ids"] = ["invented"]
        elif self.failure == "numbers":
            items[0]["summary"] = "Выигрыш 42"
        return BatchExplanationDraft(items=list(reversed(items))), OllamaChatResult(model=self.model, content="{}")


def test_one_batch_bound_by_id_and_cached_without_mutating_engine():
    async def run():
        service, ollama = RecommendationSummaryService(), FakeBatch()
        original = RecommendationService().recommend(request())
        result = await service.recommend(request(), ollama)
        assert len(ollama.calls) == 1
        assert len(ollama.calls[0]) == len(variants(original))
        assert variants(result)[0].explanation.explanation.headline == "Первый"
        for before, after in zip(variants(original), variants(result)):
            assert before.calculation == after.calculation
            assert before.explanation is None
            assert after.explanation.input_hash == after.calculation.input_hash
            assert after.explanation.scenario == "STRESS"
            assert after.explanation.generated_by == "ollama"
            assert any(f.id.startswith("comparison_") for f in after.explanation.facts)
        variants(result)[0].explanation.explanation.headline = "mutated"
        cached = await service.recommend(request(), ollama)
        assert variants(cached)[0].explanation.explanation.headline == "Первый"
        assert len(ollama.calls) == 1
        await service.recommend(request(False), ollama)
        assert len(ollama.calls) == 2
        ollama.model = "different-model"
        await service.recommend(request(), ollama)
        assert len(ollama.calls) == 3
    asyncio.run(run())


@pytest.mark.parametrize("failure", ["offline", "timeout", "missing", "duplicate", "unknown", "invented_fact", "numbers"])
def test_batch_failure_keeps_all_calculations(failure):
    async def run():
        service = RecommendationSummaryService(timeout_seconds=0.02)
        result = await service.recommend(request(), FakeBatch(failure))
        original = RecommendationService().recommend(request())
        assert len(variants(result)) == len(variants(original))
        for before, after in zip(variants(original), variants(result)):
            assert before.calculation == after.calculation
            assert after.explanation.generated_by == "template"
            assert after.explanation.warning
        assert not service._pending
    asyncio.run(run())


def test_concurrent_identical_requests_share_generation_even_if_one_disconnects():
    async def run():
        started, finish = asyncio.Event(), asyncio.Event()

        class SlowBatch(FakeBatch):
            async def explain_portfolios(self, portfolios):
                started.set()
                await finish.wait()
                return await super().explain_portfolios(portfolios)

        service, ollama = RecommendationSummaryService(), SlowBatch()
        first = asyncio.create_task(service.recommend(request(), ollama))
        await started.wait()
        second = asyncio.create_task(service.recommend(request(), ollama))
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first
        finish.set()
        result = await second
        assert len(ollama.calls) == 1
        assert all(v.explanation.generated_by == "ollama" for v in variants(result))
        await service.close()
    asyncio.run(run())


def test_fallback_cache_expires_and_no_feasible_does_not_call_model(monkeypatch):
    import app.core.services.recommendation_summary_service as module

    async def run():
        now = [100.0]
        monkeypatch.setattr(module, "monotonic", lambda: now[0])
        service, ollama = RecommendationSummaryService(), FakeBatch("offline")
        await service.recommend(request(), ollama)
        ollama.failure = None
        assert variants(await service.recommend(request(), ollama))[0].explanation.generated_by == "template"
        assert len(ollama.calls) == 1
        now[0] += 16
        assert variants(await service.recommend(request(), ollama))[0].explanation.generated_by == "ollama"
        assert len(ollama.calls) == 2
        empty = request().model_copy(update={"lot_ids": ["FIRE", "FLOOD", "ARCTIC", "SSA"]})
        result = await service.recommend(empty, ollama)
        assert result.status == "no_feasible"
        assert len(ollama.calls) == 2
    asyncio.run(run())


def test_recommend_http_contains_explanations_in_same_response():
    ollama, service = FakeBatch(), RecommendationSummaryService()
    app.dependency_overrides[get_ollama_service] = lambda: ollama
    app.dependency_overrides[get_recommendation_summary_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.post("/portfolio/recommend", json=request().model_dump())
        assert response.status_code == 200
        payload = response.json()
        for variant in [payload["recommended"], *payload["alternatives"]]:
            assert variant["explanation"]["input_hash"] == variant["calculation"]["input_hash"]
            assert variant["explanation"]["generated_by"] == "ollama"
        assert len(ollama.calls) == 1
    finally:
        app.dependency_overrides.clear()


def test_ollama_batch_uses_one_structured_call():
    class Client:
        async def chat(self, **kwargs):
            self.kwargs = kwargs
            draft, _ = await FakeBatch().explain_portfolios([{"key": "v0"}])
            return OllamaChatResult(model=kwargs["model"], content=draft.model_dump_json())

    async def run():
        client = Client()
        draft, _ = await OllamaService(client, "test-model").explain_portfolios([{"key": "v0", "facts": []}])
        assert len(draft.items) == 1
        assert client.kwargs["num_predict"] > 600
        assert client.kwargs["num_ctx"] == 8192
        assert client.kwargs["timeout_seconds"] < 95
        assert client.kwargs["format_schema"]["type"] == "object"
        assert not client.kwargs["think"]
    asyncio.run(run())


def test_batch_prompt_shares_only_identical_facts():
    class Client:
        async def chat(self, **kwargs):
            self.prompt = json.loads(kwargs["messages"][1].content)
            draft, response = await FakeBatch().explain_portfolios([{"key": "v0"}, {"key": "v1"}])
            return response.model_copy(update={"content": draft.model_dump_json()})

    async def run():
        client = Client()
        portfolios = [{"key": key, "facts": [
            {"id": "scope_limit", "text": "Общее ограничение", "source": "system"},
            {"id": "portfolio_status", "text": "Условия выполнены", "source": "calculation"},
            {"id": "lot_FIRE", "text": mode, "source": "calculation"},
            {"id": "check_c0_limit", "text": "Выполнено", "source": "calculation"},
        ]} for key, mode in [("v0", "Режим A"), ("v1", "Режим B")]]
        await OllamaService(client, "test-model").explain_portfolios(portfolios)
        assert client.prompt["common_facts"] == {
            "scope_limit": "Общее ограничение", "portfolio_status": "Условия выполнены",
        }
        assert client.prompt["portfolios"] == [
            {"key": "v0", "facts": {"lot_FIRE": "Режим A"}},
            {"key": "v1", "facts": {"lot_FIRE": "Режим B"}},
        ]
        assert len(portfolios[0]["facts"]) == 4
    asyncio.run(run())


def test_manual_selection_contains_batch_explanations_for_all_variants():
    async def run():
        auto = RecommendationService().recommend(request())
        chosen = auto.recommended or auto.alternatives[0]
        lot_ids = [item.lot_id for item in chosen.calculation.selection]
        service, ollama = RecommendationSummaryService(), FakeBatch()
        result = await service.recommend(request().model_copy(update={"lot_ids": sorted(lot_ids)}), ollama)
        assert result.status == "ok"
        assert len(ollama.calls) == 1
        for variant in variants(result):
            assert {item.lot_id for item in variant.calculation.selection} == set(lot_ids)
            assert variant.explanation.generated_by == "ollama"
            assert variant.explanation.input_hash == variant.calculation.input_hash
    asyncio.run(run())
