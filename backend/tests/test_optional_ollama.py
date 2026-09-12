import asyncio
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.core.services.ollama_service import OLLAMA_DISABLED_MESSAGE, OllamaService
from app.core.services.recommendation_service import RecommendationService
from app.infrastructure.config.config import OllamaSettings, settings
from app.infrastructure.errors.ollama_errors import OllamaDisabledError


SELECTION = [
    {"lot_id": "FIRE", "mode_id": "A"},
    {"lot_id": "AGRI", "mode_id": "C"},
    {"lot_id": "TRANS", "mode_id": "C"},
    {"lot_id": "ENV", "mode_id": "A"},
]


def assert_template(result):
    assert result["generated_by"] == "template"
    assert result["unavailable_reason"] == "disabled"
    assert result["model"] is None
    assert result["warning"] == OLLAMA_DISABLED_MESSAGE
    explanation = result["explanation"]
    assert explanation["summary"]
    known_ids = {fact["id"] for fact in result["facts"]}
    points = [*explanation["strengths"], *explanation["limitations"]]
    assert points
    assert all(point["fact_ids"] and set(point["fact_ids"]) <= known_ids for point in points)


def test_ollama_is_opt_in_from_environment(monkeypatch):
    monkeypatch.delenv("COSMOS_OLLAMA_ENABLED", raising=False)
    assert OllamaSettings(_env_file=None).enabled is False
    monkeypatch.setenv("COSMOS_OLLAMA_ENABLED", "true")
    assert OllamaSettings(_env_file=None).enabled is True
    monkeypatch.setenv("COSMOS_OLLAMA_ENABLED", "false")
    assert OllamaSettings(_env_file=None).enabled is False


@pytest.mark.parametrize("method", ["chat", "select_evidence", "explain_portfolios"])
def test_disabled_service_rejects_generation_before_processing_inputs(method):
    async def run():
        service = OllamaService(None, "test-model")
        assert service.enabled is False
        with pytest.raises(OllamaDisabledError, match="AI-объяснение отключено"):
            await getattr(service, method)([])

    asyncio.run(run())


def test_disabled_api_never_creates_client_and_preserves_all_calculations(monkeypatch):
    monkeypatch.setattr(settings.ollama, "enabled", False)
    monkeypatch.setattr(RecommendationService, "warmup", lambda self: None)

    def forbid_client(*args, **kwargs):
        pytest.fail("Disabled Ollama must not create an HTTP client")

    monkeypatch.setattr(main, "OllamaClient", forbid_client)
    select_evidence = AsyncMock(side_effect=AssertionError("Model method must not be called"))
    explain_portfolio = AsyncMock(side_effect=AssertionError("Model method must not be called"))
    monkeypatch.setattr(OllamaService, "select_evidence", select_evidence)
    monkeypatch.setattr(OllamaService, "explain_portfolio", explain_portfolio)

    with TestClient(main.app) as client:
        assert client.get("/health").json() == {
            "status": "ok", "capabilities": {"ollama_enabled": False},
        }
        dataset_hash = client.get("/portfolio/catalog").json()["dataset_hash"]
        evaluate = {"dataset_hash": dataset_hash, "selection": SELECTION}
        calculation = client.post("/portfolio/evaluate", json=evaluate).json()
        response = client.post("/portfolio/explain", json={**evaluate, "scenario": "STRESS"})
        assert response.status_code == 200
        explained = response.json()
        assert explained["calculation"] == calculation
        assert_template(explained)

        request = {"dataset_hash": dataset_hash, "with_explanations": False}
        calculated = client.post("/portfolio/recommend", json=request).json()
        request["with_explanations"] = True
        response = client.post("/portfolio/recommend", json=request)
        assert response.status_code == 200
        recommended = response.json()
        variants = [recommended["recommended"], *recommended["alternatives"]]
        for variant in variants:
            assert_template(variant["explanation"])
            assert variant["explanation"]["composition"] == "extractive"
        assert client.post("/portfolio/recommend", json=request).json() == recommended
        plain = deepcopy(recommended)
        for variant in [plain["recommended"], *plain["alternatives"]]:
            variant["explanation"] = None
        calculated["request"]["with_explanations"] = True
        assert plain == calculated

        comparison_request = {"variants": [
            {"dataset_hash": dataset_hash, "selection": variant["calculation"]["selection"]}
            for variant in variants[:2]
        ]}
        comparison = client.post("/portfolio/compare", json=comparison_request).json()
        response = client.post("/portfolio/compare/analyze", json={**comparison_request, "scenario": "STRESS"})
        assert response.status_code == 200
        analyzed = response.json()
        assert analyzed["comparison"] == comparison
        assert_template(analyzed)
        assert analyzed["composition"] == "extractive"

    select_evidence.assert_not_awaited()
    explain_portfolio.assert_not_awaited()


def test_enabled_lifespan_creates_and_closes_model_client(monkeypatch):
    monkeypatch.setattr(settings.ollama, "enabled", True)
    monkeypatch.setattr(RecommendationService, "warmup", lambda self: None)
    clients = []

    class RecordingClient:
        def __init__(self, *args):
            self.closed = False
            clients.append(self)

        async def close(self):
            self.closed = True

    monkeypatch.setattr(main, "OllamaClient", RecordingClient)
    with TestClient(main.app) as client:
        assert main.app.state.ollama_service.enabled is True
        assert len(clients) == 1
        assert client.get("/health").json() == {
            "status": "ok", "capabilities": {"ollama_enabled": True},
        }
    assert clients[0].closed is True
