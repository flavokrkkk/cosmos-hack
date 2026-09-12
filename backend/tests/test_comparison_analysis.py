import asyncio

import pytest
from fastapi.testclient import TestClient

from app.api.v1.dependencies import get_comparison_analysis_service, get_ollama_service
from app.core.dto.ollama import OllamaChatResult, PortfolioExplanationDraft, EvidenceBatch
from app.core.dto.portfolio import ComparisonAnalysisRequest, CompareRequest, RecommendRequest
from app.core.services.comparison_analysis_service import ComparisonAnalysisService, comparison_facts
from app.core.services.portfolio_service import PortfolioService
from app.core.services.recommendation_service import RecommendationService
from app.core.services.ollama_service import OllamaService
from app.infrastructure.errors.ollama_errors import OllamaUnavailableError
from app.main import app


def payload():
    catalog = PortfolioService().catalog()
    result = RecommendationService().recommend(RecommendRequest(dataset_hash=catalog.dataset_hash))
    variants = [v for v in [result.recommended, *result.alternatives] if v is not None][:2]
    return {"variants": [{"dataset_hash": catalog.dataset_hash, "selection": v.calculation.model_dump()["selection"]} for v in variants], "scenario": "STRESS"}


class FakeOllama:
    enabled = True
    model = "test"

    def __init__(self, failure=None):
        self.calls = []
        self.failure = failure

    async def select_evidence(self, portfolios):
        facts = portfolios[0]["facts"]
        self.calls.append(facts)
        if self.failure == "offline":
            raise OllamaUnavailableError("offline")
        strength_ids = [fact["id"] for fact in facts if fact["kind"] == "strength"][:2]
        if self.failure == "unknown":
            strength_ids = ["invented"]
        elif self.failure == "wrong_section":
            strength_ids = ["scope"]
        return EvidenceBatch(items=[{
            "key": "comparison",
            "narrative": "Варианты отличаются по расчётным показателям. У каждого есть своё преимущество. При выборе важно учитывать показанные ограничения.",
            "summary_ids": ["v1_c0_mrub", "v1_vpub_mrub_per_year"],
            "strength_ids": strength_ids,
            "limitation_ids": [fact["id"] for fact in facts if fact["kind"] == "limitation"][:2],
        }]), OllamaChatResult(model=self.model, content="{}")

    async def analyze_comparison(self, facts):
        self.calls.append(facts)
        if self.failure == "offline":
            raise OllamaUnavailableError("offline")
        return PortfolioExplanationDraft(
            headline="Сравнение вариантов",
            summary="Показатели различаются." if self.failure != "numbers" else "Выигрыш 99",
            strengths=[{"text": "Второй вариант проходит проверку.", "fact_ids": ["invented" if self.failure == "unknown" else "v1_status"]}],
            limitations=[{"text": "Нет универсального победителя.", "fact_ids": ["scope"]}],
        ), OllamaChatResult(model=self.model, content="{}")


def test_analysis_uses_recalculation_cache_and_order():
    async def run():
        request = ComparisonAnalysisRequest(**payload())
        service, ollama = ComparisonAnalysisService(), FakeOllama()
        result = await service.analyze(request, ollama)
        expected = PortfolioService().compare(CompareRequest(variants=request.variants))
        assert result.comparison == expected
        assert result.generated_by == "ollama"
        assert ollama.calls[0] == [fact.model_dump() for fact in comparison_facts(expected, "STRESS")]
        result.explanation.headline = "changed"
        cached = await service.analyze(request, ollama)
        assert cached.explanation.headline != "changed"
        assert len(ollama.calls) == 1
        reversed_result = await service.analyze(request.model_copy(update={"variants": list(reversed(request.variants))}), ollama)
        assert reversed_result.input_hash != cached.input_hash
        assert reversed_result.comparison.deltas[1]["c0_mrub"] == -cached.comparison.deltas[1]["c0_mrub"]
        base = await service.analyze(request.model_copy(update={"scenario": "BASE"}), ollama)
        assert base.input_hash != cached.input_hash
        assert len(ollama.calls) == 3
    asyncio.run(run())


def test_disabled_comparison_skips_busy_model_and_separates_cached_output():
    async def run():
        request = ComparisonAnalysisRequest(**payload())
        service, enabled = ComparisonAnalysisService(), FakeOllama()
        generated = await service.analyze(request, enabled)
        disabled = OllamaService(None, enabled.model)
        async with service._lock:
            plain = await asyncio.wait_for(service.analyze(request, disabled), timeout=2)
        assert plain.comparison == generated.comparison
        assert plain.generated_by == "template"
        assert plain.model is None
        assert len(enabled.calls) == 1
        assert (await service.analyze(request, enabled)).generated_by == "ollama"
        assert len(enabled.calls) == 1

    asyncio.run(run())


def test_comparison_facts_explain_surplus_and_quality_indices_with_their_units():
    catalog = PortfolioService().catalog()
    selections = [
        [("FIRE", "A"), ("AGRI", "C"), ("TRANS", "C"), ("ENV", "A")],
        [("FIRE", "A"), ("INFRA", "B"), ("TRANS", "A"), ("ENV", "A")],
    ]
    comparison = PortfolioService().compare(CompareRequest(variants=[
        {"dataset_hash": catalog.dataset_hash, "selection": [
            {"lot_id": lot, "mode_id": mode} for lot, mode in selection
        ]} for selection in selections
    ]))
    facts = {fact.id: fact for fact in comparison_facts(comparison, "BASE")}
    surplus = facts["v1_annual_surplus_mrub"]
    assert "млн ₽/год" in surplus.text
    assert surplus.kind == "limitation"
    for field in ("readiness_1_5", "resilience_1_5", "scale_1_5"):
        assert "балла" in facts[f"v1_{field}"].text
        assert facts[f"v1_{field}"].kind == "limitation"
    assert "тиражируемость" in facts["v1_scale_1_5"].text
    assert "индекс t_rep" in facts["v1_t_rep"].text
    assert "тиражируемость" not in facts["v1_t_rep"].text
    assert "не является чистой прибылью" in facts["scope"].text


@pytest.mark.parametrize("failure", ["offline", "wrong_section", "unknown"])
def test_failure_preserves_comparison(failure):
    async def run():
        service, ollama = ComparisonAnalysisService(), FakeOllama(failure)
        result = await service.analyze(ComparisonAnalysisRequest(**payload()), ollama)
        assert result.generated_by == "template"
        assert result.model is None
        assert result.warning
        assert len(result.comparison.variants) == 2
        await service.analyze(ComparisonAnalysisRequest(**payload()), ollama)
        assert len(ollama.calls) == 1
    asyncio.run(run())


def test_http_analysis_and_invalid_requests():
    ollama, service = FakeOllama(), ComparisonAnalysisService()
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_ollama_service] = lambda: ollama
    app.dependency_overrides[get_comparison_analysis_service] = lambda: service
    try:
        with TestClient(app) as client:
            request = payload()
            response = client.post("/portfolio/compare/analyze", json=request)
            assert response.status_code == 200
            assert response.json()["generated_by"] == "ollama"
            assert client.post("/portfolio/compare/analyze", json={**request, "scenario": "OTHER"}).status_code == 422
            assert client.post("/portfolio/compare/analyze", json={**request, "variants": [request["variants"][0]] * 2}).status_code == 422
            request["variants"][0]["selection"].pop()
            assert client.post("/portfolio/compare/analyze", json=request).status_code == 422
            stale = payload()
            stale["variants"][0]["dataset_hash"] = "0" * 64
            assert client.post("/portfolio/compare/analyze", json=stale).status_code == 409
            assert len(ollama.calls) == 1
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def test_comparison_prompt_has_bounded_output():
    class Client:
        async def chat(self, **kwargs):
            self.options = kwargs
            draft, response = await FakeOllama().analyze_comparison([])
            draft.headline = "Компромиссы выбранных портфелей"
            return response.model_copy(update={"content": draft.model_dump_json()})

    async def run():
        client = Client()
        draft, _ = await OllamaService(client, "test").analyze_comparison([])
        assert draft.headline
        assert client.options["format_schema"]["properties"]["limitations"]["maxItems"] == 2
        assert client.options["num_predict"] == 1000
        assert client.options["timeout_seconds"] < 65
    asyncio.run(run())
