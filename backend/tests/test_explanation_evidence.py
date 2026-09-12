import asyncio
import json

import pytest
from pydantic import ValidationError

from app.core.dto.ollama import EvidenceBatch, EvidenceSelection, OllamaChatResult
from app.core.dto.portfolio import RecommendRequest
from app.core.services.explanation_evidence import number, portfolio_evidence, render_evidence
from app.core.services.ollama_service import OllamaService
from app.core.services.portfolio_service import PortfolioService
from app.core.services.recommendation_service import RecommendationService
from app.infrastructure.errors.ollama_errors import OllamaResponseError


NARRATIVE = (
    "Портфель проходит заданные условия сценария. Его преимущество подтверждено расчётом. "
    "При этом у варианта остаётся важное ограничение."
)


def example():
    result = RecommendationService().recommend(RecommendRequest(dataset_hash=PortfolioService().catalog().dataset_hash))
    return result.recommended.calculation


def test_evidence_contains_real_cash_budget_and_lot_deficits():
    calculation = example()
    facts = portfolio_evidence(calculation, "STRESS")
    by_id = {fact.id: fact for fact in facts}
    assert number(calculation.metrics.c0_mrub) in by_id["budget"].text
    assert number(calculation.metrics.cash_mrub_per_year) in by_id["cash_balance"].text
    assert by_id["cash_balance"].kind == "strength"
    assert by_id["lot_deficits"].kind == "limitation"
    for row in calculation.detail:
        if row.cash_mrub_per_year < row.opex_mrub_per_year:
            assert row.lot_id in by_id["lot_deficits"].text
    assert by_id["scope_limit"].kind == "limitation"
    assert number(0) == "0"
    assert number(1000.5) == "1 000,5"
    assert number(1.018) == "1,02"


def test_render_uses_model_narrative_and_exact_source_points():
    facts = portfolio_evidence(example(), "BASE")
    selection = EvidenceSelection(key="v0", narrative=NARRATIVE, summary_ids=["budget", "cash_balance"], strength_ids=["budget"], limitation_ids=["lot_deficits"])
    explanation = render_evidence("Портфель команды", facts, selection)
    by_id = {fact.id: fact for fact in facts}
    assert explanation.summary == NARRATIVE
    for point in explanation.strengths + explanation.limitations:
        assert point.text == by_id[point.fact_ids[0]].text
    with pytest.raises(ValidationError):
        EvidenceSelection(**selection.model_dump(), summary="Тиражируемость — не устойчивость")


@pytest.mark.parametrize("change", [
    {"strength_ids": ["scope_limit"]},
    {"limitation_ids": ["budget"]},
    {"summary_ids": ["portfolio_status", "scope_limit"]},
    {"summary_ids": ["budget", "invented"]},
    {"strength_ids": ["budget", "budget"]},
])
def test_invalid_and_generic_evidence_is_rejected(change):
    selection = EvidenceSelection(key="v0", narrative=NARRATIVE, summary_ids=["budget", "cash_balance"], strength_ids=["budget"], limitation_ids=["lot_deficits"])
    with pytest.raises(OllamaResponseError):
        render_evidence("Портфель", portfolio_evidence(example(), "BASE"), selection.model_copy(update=change))


def test_model_selects_ids_in_one_call_and_cannot_add_text():
    class Client:
        async def chat(self, **kwargs):
            self.request = kwargs
            return OllamaChatResult(model="test", content=EvidenceBatch(items=[EvidenceSelection(
                key="v0", narrative=NARRATIVE, summary_ids=["budget", "cash_balance"], strength_ids=["budget"], limitation_ids=["lot_deficits"],
            )]).model_dump_json())

    async def run():
        client = Client()
        facts = portfolio_evidence(example(), "BASE")
        draft, _ = await OllamaService(client, "test").select_evidence([{"key": "v0", "facts": [fact.model_dump() for fact in facts]}])
        assert draft.items[0].key == "v0"
        schema = client.request["format_schema"]["$defs"]["EvidenceSelection"]
        assert "summary" not in schema["properties"]
        assert schema["additionalProperties"] is False
        assert client.request["think"] is False
    asyncio.run(run())


def test_model_selects_evidence_in_two_parallel_groups():
    class Client:
        def __init__(self):
            self.active = 0
            self.max_active = 0
            self.calls = []

        async def chat(self, **kwargs):
            payload = json.loads(kwargs["messages"][1].content)
            self.calls.append([item["key"] for item in payload])
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            await asyncio.sleep(0.01)
            self.active -= 1
            return OllamaChatResult(model="test", content=EvidenceBatch(items=[EvidenceSelection(
                key=item["key"], narrative=NARRATIVE, summary_ids=["budget", "cash_balance"],
                strength_ids=["budget"], limitation_ids=["lot_deficits"],
            ) for item in payload]).model_dump_json(), prompt_eval_count=10, eval_count=5)

    async def run():
        client = Client()
        facts = [fact.model_dump() for fact in portfolio_evidence(example(), "BASE")]
        portfolios = [{"key": f"v{index}", "facts": facts} for index in range(5)]
        draft, result = await OllamaService(client, "test", parallel_requests=2).select_evidence(portfolios)
        assert {item.key for item in draft.items} == {f"v{index}" for index in range(5)}
        assert sorted(map(len, client.calls)) == [2, 3]
        assert client.max_active == 2
        assert result.prompt_eval_count == 20
        assert result.eval_count == 10

    asyncio.run(run())


def test_model_evidence_with_wrong_kind_is_safely_filtered():
    class Client:
        async def chat(self, **kwargs):
            return OllamaChatResult(model="test", content=EvidenceBatch(items=[EvidenceSelection(
                key="v0", narrative=NARRATIVE, summary_ids=["public_core", "scope_limit"],
                strength_ids=["public_core", "budget"], limitation_ids=["scope_limit"],
            )]).model_dump_json())

    async def run():
        facts = portfolio_evidence(example(), "BASE")
        draft, _ = await OllamaService(Client(), "test").select_evidence([
            {"key": "v0", "facts": [fact.model_dump() for fact in facts]},
        ])
        selection = draft.items[0]
        assert selection.strength_ids == ["budget"]
        assert any(next(fact for fact in facts if fact.id == key).source == "calculation" for key in selection.summary_ids)
        explanation = render_evidence("Портфель", facts, selection)
        assert "Его главное преимущество" in explanation.summary
        assert "При этом" in explanation.summary

    asyncio.run(run())
