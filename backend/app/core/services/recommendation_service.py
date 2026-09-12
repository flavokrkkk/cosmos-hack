from functools import lru_cache
from threading import RLock

from app.core.dto.portfolio import (
    EvaluateRequest, RecommendRequest, RecommendationResult, RecommendationVariant, SelectionItem,
)
from app.core.services.portfolio_engine import space
from app.core.services.portfolio_engine.hybrid import MAXIMIZE, MINIMIZE
from app.core.services.portfolio_ranking_service import METHOD, analyze
from app.core.services.portfolio_service import ENGINE_VERSION, PortfolioService, input_hash, verify_dataset
from app.infrastructure.errors.portfolio_errors import InvalidPortfolio


REFERENCE_POINTS = [
    ("vpub", False, "Наибольшая общественная ценность", "Максимум VPUB на фронте. Сравнительная точка, не отдельный метод выбора."),
    ("c0", True, "Наименьшие стартовые затраты", "Минимум C0 на фронте. Цена экономии видна в остальных показателях."),
    ("surplus", False, "Наибольший денежный остаток", "Максимум CASH − OPEX на фронте. Показывает денежную цену выбранного баланса."),
]
_search_lock = RLock()


@lru_cache(maxsize=128)
def _recommend_ranked(serialized_request: str) -> RecommendationResult:
    request = RecommendRequest.model_validate_json(serialized_request)
    frame, candidates, analysis = analyze(request)
    front = space.pareto_front(candidates, maximize=MAXIMIZE, minimize=MINIMIZE)
    method = METHOD
    result = RecommendationResult(
        input_hash=input_hash({**request.model_dump(exclude={"with_explanations"}), "engine_version": ENGINE_VERSION}), request=request,
        status="no_feasible" if candidates.empty else "ok", considered_count=len(frame),
        base_count=int(frame.BASE_ok.sum()), stress_count=int((frame.BASE_ok & frame.STRESS_ok).sum()),
        feasible_count=len(candidates), pareto_count=len(front), method=method, recommended=None,
        alternatives=[], analysis=analysis,
    )
    if candidates.empty:
        return result
    service = PortfolioService()

    def variant(selection_id: str, title: str, reason: str) -> RecommendationVariant:
        return RecommendationVariant(title=title, reason=reason, calculation=service.evaluate(EvaluateRequest(
            dataset_hash=request.dataset_hash,
            inputs=request.inputs,
            selection=[SelectionItem(lot_id=lot, mode_id=mode) for lot, mode in space.parse_selection(selection_id)],
        )))

    primary = analysis.winner
    result.recommended = variant(primary.selection_id, method.title, method.description)
    used = {primary.selection_id}
    for column, ascending, title, reason in REFERENCE_POINTS:
        row = front.sort_values([column, "stable_id"], ascending=[ascending, True]).iloc[0]
        if row.stable_id not in used:
            result.alternatives.append(variant(row.stable_id, title, reason))
            used.add(row.stable_id)
    return result


class RecommendationService:
    def recommend(self, request: RecommendRequest) -> RecommendationResult:
        verify_dataset(request.dataset_hash)
        known_lots = ({lot.lot_id for lot in request.inputs.lots} if request.inputs else
                      {lot.lot_id for lot in PortfolioService().catalog().lots})
        unknown = (set(request.lot_ids or []) | set(request.required_public_lot_ids)) - known_lots
        if unknown:
            raise InvalidPortfolio(f"Неизвестные лоты: {', '.join(sorted(unknown))}")
        with _search_lock:
            payload = request.model_copy(update={"with_explanations": False}).model_dump_json()
            result = _recommend_ranked(payload)
        return result.model_copy(deep=True)

    def warmup(self) -> None:
        catalog = PortfolioService().catalog()
        for require_stress in (False, True):
            self.recommend(RecommendRequest(dataset_hash=catalog.dataset_hash, require_stress=require_stress))
