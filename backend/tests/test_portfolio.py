import hashlib
import json
from math import comb

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.core.dto.portfolio import EvaluateRequest, RecommendRequest
from app.core.services.portfolio_engine import canonical, constraints, space
from app.core.services.portfolio_engine.decision import load_decision
from app.core.services.portfolio_service import PortfolioService
from app.core.services.recommendation_service import RecommendationService, rank_candidates
from app.main import app


SELECTION = [{"lot_id": lot, "mode_id": mode} for lot, mode in
             [("FIRE", "A"), ("AGRI", "A"), ("TRANS", "B"), ("ENV", "A")]]


@pytest.fixture
def service():
    return PortfolioService()


@pytest.fixture
def catalog(service):
    return service.catalog()


@pytest.fixture
def client():
    instance = TestClient(app)
    try:
        yield instance
    finally:
        instance.close()


def test_catalog_sources_and_mutation_isolation(service, catalog):
    assert len(catalog.lots) == 8
    assert len(catalog.modes) == 3
    assert all(len(rows) == 9 for rows in catalog.constraints.values())
    catalog.lots[0].c0_mrub = -10
    assert service.catalog().lots[0].c0_mrub > 0
    lots, modes, config = canonical.load_case()
    lots.loc[0, "c0_mrub"] = -10
    modes.loc[0, "k_c0"] = -10
    config["scenarios"]["BASE"]["c0_max_mrub"] = -10
    new_lots, new_modes, new_config = canonical.load_case()
    assert new_lots.iloc[0].c0_mrub == 320
    assert new_modes.iloc[0].k_c0 == 1.05
    assert new_config["scenarios"]["BASE"]["c0_max_mrub"] == 1300


def test_calculation_matches_core_and_stable_selection(service, catalog):
    request = EvaluateRequest(dataset_hash=catalog.dataset_hash, selection=SELECTION)
    result = service.evaluate(request)
    reversed_result = service.evaluate(request.model_copy(update={"selection": list(reversed(request.selection))}))
    assert result == reversed_result
    lots, modes, config = canonical.load_case()
    _, expected = canonical.case_core.evaluate_portfolio(sorted((item["lot_id"], item["mode_id"]) for item in SELECTION), lots, modes, config)
    assert result.metrics.model_dump() == expected
    assert result.feasible_by_scenario == {"BASE": True, "STRESS": True}
    assert result.model_dump_json() == reversed_result.model_dump_json()


def test_empty_and_partial_are_finite(service, catalog):
    for selection in ([], SELECTION[:1], SELECTION[:3]):
        result = service.evaluate(EvaluateRequest(dataset_hash=catalog.dataset_hash, selection=selection))
        assert result.status == "incomplete"
        assert not any(result.feasible_by_scenario.values())
        json.dumps(result.model_dump(), allow_nan=False)
        if selection:
            count = next(row for row in result.checks["BASE"] if row.code == "exact_lot_count")
            assert count.slack is None
        else:
            assert result.metrics is None


@pytest.mark.parametrize("scenario", ["BASE", "STRESS"])
def test_every_constraint_boundary(scenario):
    metrics = {
        "selected_lots": 4, "territorial_archetypes": 4, "capability_groups": 3,
        "public_core_lots": 3, "c0_mrub": 1100, "opex_mrub_per_year": 300,
        "vpub_mrub_per_year": 1200, "kcash": 1.0, "t_rep": 0.7,
    }
    for definition in constraints.constraint_definitions(scenario):
        key, threshold = definition["metric"], definition["threshold"]
        at_boundary = {**metrics, key: threshold}
        assert all(row.passed for row in constraints.diagnose(at_boundary, scenario))
        step = 1 if definition["unit"] == "шт." else 1e-6
        worse = threshold + step if definition["operator"] in ("<=", "==") else threshold - step
        rows = constraints.diagnose({**metrics, key: worse}, scenario)
        assert [row.code for row in rows if not row.passed] == [definition["code"]]


def test_all_modes_match_reference():
    lots, modes, _ = canonical.load_case()
    for lot in lots.itertuples():
        for mode in modes.itertuples():
            detail, _ = canonical.evaluate([(lot.lot_id, mode.mode_id)])
            assert detail.iloc[0].to_dict() == canonical.case_core.apply_mode(lot, mode)


def test_original_source_hashes():
    expected = {
        "case_core.py": "0a6da8b99dbb2e6ff03cb94012f539d8cd0b9c7dd05525bda5b202ebb461e20c",
        "data/lots.csv": "8e2b6244178344f9f97050ce5c9f337cd311e9f86bbd96bbbfbdde6999c4ba8b",
    }
    for filename, digest in expected.items():
        assert hashlib.sha256((canonical.CASE_ROOT / filename).read_bytes()).hexdigest() == digest


def test_recommendations_are_computed_and_reproducible(catalog):
    """ПРАВКА 12.09.2026: тест переписан под новое поведение.

    Раньше утверждал, что `recommended` — вариант с максимальным VPUB. Это и
    было проблемой: инструмент короновал победителя по одному показателю и
    расходился с управленческой запиской. Теперь `recommended` — выбор команды
    из config/decision.json, помеченный отдельно от машинного результата, а
    крайние точки фронта уехали в `alternatives`. Причина — в шапке
    recommendation_service.py и в docs/notes/2026-09-12-tool-note-alignment.md.
    """
    service = RecommendationService()
    for require_stress in (False, True):
        request = RecommendRequest(dataset_hash=catalog.dataset_hash, require_stress=require_stress)
        result = service.recommend(request)
        assert result == service.recommend(request)
        assert (result.considered_count, result.base_count, result.stress_count) == (5670, 1031, 143)

        scenario = "STRESS" if require_stress else "BASE"
        assert result.recommended is not None, "выбор команды обязан лежать на фронте обоих сценариев"
        assert result.recommended.title == "Портфель команды"
        assert result.recommended.calculation.feasible_by_scenario[scenario]

        # Выбор команды берётся из конфига, а не из сортировки по показателю.
        expected = space.format_selection(sorted(load_decision().recommended.selection))
        actual = result.recommended.calculation
        assert space.format_selection([(i.lot_id, i.mode_id) for i in actual.selection]) == expected

        # И он НЕ обязан быть максимумом VPUB — именно это раньше подменяло решение.
        front = space.pareto_front(space.feasible(scenario))
        assert actual.metrics.vpub_mrub_per_year <= front.vpub.max()

        # Опорные точки фронта — объективные крайние значения.
        titles = {variant.title for variant in result.alternatives}
        assert "Наибольшая общественная ценность" in titles
        best_vpub = next(v for v in result.alternatives if v.title == "Наибольшая общественная ценность")
        assert best_vpub.calculation.metrics.vpub_mrub_per_year == front.vpub.max()

        ids = [actual.input_hash, *(variant.calculation.input_hash for variant in result.alternatives)]
        assert len(ids) == len(set(ids)), "опорные точки не должны дублировать друг друга"

        result.recommended.title = "mutated"
        assert service.recommend(request).recommended.title != "mutated"


def test_team_choice_is_not_substituted_when_outside_search_area(catalog):
    """Если портфель команды не попал в область поиска, подмены не происходит.

    Это защита от худшего сценария: инструмент не должен выдавать машинный
    максимум за решение команды. Лучше пустое поле, чем ложная подпись.
    """
    service = RecommendationService()
    result = service.recommend(RecommendRequest(
        dataset_hash=catalog.dataset_hash, require_stress=True,
        lot_ids=["AGRI", "INFRA", "TRANS", "ENV"],
    ))
    assert result.status == "ok"
    assert result.pareto_count > 0
    assert result.recommended is None, "чужая область поиска — выбора команды здесь нет"
    assert result.alternatives, "опорные точки фронта показываются в любом случае"


def test_ranking_raw_precision_and_stable_ties():
    rows = [dict(lots=lot, modes="A", vpub=value, c0=100, opex=10, kcash=1,
                 t_rep=.7, readiness=4, resilience=4, scale=4)
            for lot, value in [("FIRE", 1000.000001), ("ENV", 1000.000002), ("AGRI", 1000.000002)]]
    frame = pd.DataFrame(rows)
    assert list(rank_candidates(frame).stable_id) == ["AGRI:A", "ENV:A", "FIRE:A"]
    assert rank_candidates(frame).equals(rank_candidates(frame.iloc[::-1]))


def test_pareto_complete_on_small_example():
    frame = pd.DataFrame({"benefit": [10, 9, 10, 12], "cost": [10, 11, 10, 15]})
    result = space.pareto_front(frame, maximize=["benefit"], minimize=["cost"])
    assert result.to_dict("records") == frame.iloc[[0, 2, 3]].to_dict("records")
    assert space.pareto_front(frame.iloc[:0]).empty


def test_space_cache_is_not_mutable():
    frame = space.enumerate_space()
    frame.loc[0, "vpub"] = -1
    assert space.enumerate_space().iloc[0].vpub > 0


def test_api_catalog_evaluate_compare(client):
    catalog = client.get("/portfolio/catalog").json()
    request = {"dataset_hash": catalog["dataset_hash"], "selection": SELECTION}
    response = client.post("/portfolio/evaluate", json=request)
    assert response.status_code == 200
    assert response.json()["metrics"]["c0_mrub"] == 1153
    result = client.post("/portfolio/compare", json={"variants": [request, request]})
    assert result.status_code == 200
    assert all(value == 0 for value in result.json()["deltas"][1].values())


@pytest.mark.parametrize("selection", [
    SELECTION + [SELECTION[0]], [SELECTION[0], SELECTION[0]],
    [{"lot_id": "MISSING", "mode_id": "A"}], [{"lot_id": "FIRE", "mode_id": "D"}],
])
def test_api_rejects_invalid_selection(client, catalog, selection):
    response = client.post("/portfolio/evaluate", json={"dataset_hash": catalog.dataset_hash, "selection": selection})
    assert response.status_code == 422


def test_api_rejects_client_metrics_and_wrong_dataset(client, catalog):
    assert client.post("/portfolio/evaluate", json={"dataset_hash": catalog.dataset_hash,
                        "selection": SELECTION, "metrics": {"c0_mrub": 0}}).status_code == 422
    assert client.post("/portfolio/evaluate", json={"dataset_hash": "0" * 64,
                        "selection": SELECTION}).status_code == 409
    assert client.post("/portfolio/recommend", json={"dataset_hash": catalog.dataset_hash,
                        "require_stress": "false"}).status_code == 422
    assert client.post("/portfolio/recommend", json={"dataset_hash": catalog.dataset_hash,
                        "method_id": "unknown"}).status_code == 422


def test_api_recommend_without_selection(client, catalog):
    response = client.post("/portfolio/recommend", json={"dataset_hash": catalog.dataset_hash})
    assert response.status_code == 200
    assert response.json()["recommended"]["calculation"]["status"] == "complete"


@pytest.mark.parametrize("require_stress", [False, True])
def test_recommend_modes_for_fixed_lots(client, catalog, require_stress):
    ids = [item["lot_id"] for item in SELECTION]
    request = {"dataset_hash": catalog.dataset_hash, "lot_ids": ids, "require_stress": require_stress}
    response = client.post("/portfolio/recommend", json=request)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["considered_count"] == 81
    assert data["request"]["lot_ids"] == sorted(ids)
    frame = space.enumerate_space()
    frame = frame[frame.lots.map(lambda value: set(value.split("+")) == set(ids))]
    candidates = space.feasible("STRESS" if require_stress else "BASE", frame)
    assert data["base_count"] == int(frame.BASE_ok.sum())
    assert data["stress_count"] == int(frame.STRESS_ok.sum())
    assert data["feasible_count"] == len(candidates)
    # ПРАВКА 12.09.2026: `recommended` — выбор команды, а не вершина сортировки.
    # Лоты здесь совпадают с портфелем записки, поэтому выбор команды в области
    # поиска есть и должен прийти именно он, а не максимум по VPUB.
    expected = space.format_selection(sorted(load_decision().recommended.selection))
    selection = data["recommended"]["calculation"]["selection"]
    assert space.format_selection((item["lot_id"], item["mode_id"]) for item in selection) == expected
    top_by_vpub = rank_candidates(candidates).iloc[0].stable_id
    if top_by_vpub != expected:
        assert any(v["title"] == "Наибольшая общественная ценность" for v in data["alternatives"]), \
            "максимум VPUB обязан остаться видимым как опорная точка фронта"
    for variant in [data["recommended"], *data["alternatives"]]:
        assert {item["lot_id"] for item in variant["calculation"]["selection"]} == set(ids)
    reversed_response = client.post("/portfolio/recommend", json={**request, "lot_ids": ids[::-1]})
    assert reversed_response.json() == data
    unrestricted = client.post("/portfolio/recommend", json={"dataset_hash": catalog.dataset_hash})
    assert unrestricted.json()["considered_count"] == 5670


@pytest.mark.parametrize("candidate_count", [5, 6, 7, 8])
def test_recommend_searches_all_four_lot_portfolios_inside_candidate_pool(
    client, catalog, candidate_count,
):
    base_ids = ["FIRE", "AGRI", "TRANS", "ENV"]
    extra_ids = [lot.lot_id for lot in catalog.lots if lot.lot_id not in base_ids]
    ids = [*base_ids, *extra_ids[:candidate_count - len(base_ids)]]
    response = client.post(
        "/portfolio/recommend",
        json={"dataset_hash": catalog.dataset_hash, "lot_ids": ids},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["considered_count"] == comb(candidate_count, 4) * 3**4
    assert data["request"]["lot_ids"] == sorted(ids)
    allowed = set(ids)
    variants = [variant for variant in [data["recommended"], *data["alternatives"]] if variant]
    assert variants
    for variant in variants:
        selected = {item["lot_id"] for item in variant["calculation"]["selection"]}
        assert len(selected) == 4
        assert selected <= allowed


@pytest.mark.parametrize("ids", [[], ["FIRE"], ["FIRE", "AGRI", "ENV"],
    [f"LOT_{index}" for index in range(9)], ["FIRE", "FIRE", "ENV", "TRANS"],
    ["FIRE", "AGRI", "ENV", "MISSING"]])
def test_fixed_lots_reject_invalid_selection(client, catalog, ids):
    response = client.post("/portfolio/recommend", json={"dataset_hash": catalog.dataset_hash, "lot_ids": ids})
    assert response.status_code == 422


def test_fixed_lots_no_feasible_does_not_replace_lots(client, catalog):
    response = client.post("/portfolio/recommend", json={"dataset_hash": catalog.dataset_hash,
        "lot_ids": ["FLOOD", "AGRI", "ARCTIC", "TRANS"], "require_stress": True})
    assert response.status_code == 200
    data = response.json()
    assert data["considered_count"] == 81
    assert data["status"] == "no_feasible"
    assert data["recommended"] is None
    assert data["alternatives"] == []


def test_portfolio_openapi_has_no_authentication(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path, method in [("/portfolio/catalog", "get"), ("/portfolio/evaluate", "post"),
                         ("/portfolio/recommend", "post"), ("/portfolio/compare", "post"),
                         ("/portfolio/explain", "post")]:
        assert not paths[path][method].get("security")
    assert not any(path.startswith("/admin/") for path in paths)


def test_no_feasible_is_explicit(catalog, monkeypatch):
    from app.core.services.recommendation_service import _recommend

    empty = space.enumerate_space().iloc[:0]
    _recommend.cache_clear()
    monkeypatch.setattr(space, "feasible", lambda *_: empty)
    try:
        result = RecommendationService().recommend(RecommendRequest(dataset_hash=catalog.dataset_hash))
        assert result.status == "no_feasible"
        assert result.recommended is None
        assert result.alternatives == []
    finally:
        _recommend.cache_clear()
