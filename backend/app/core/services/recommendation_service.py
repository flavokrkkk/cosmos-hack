from functools import lru_cache
from threading import RLock

from app.core.dto.portfolio import (
    EvaluateRequest, RecommendRequest, RecommendationResult, RecommendationVariant, SelectionItem,
)
from app.core.services.portfolio_engine import space
from app.core.services.portfolio_service import ENGINE_VERSION, METHOD, PortfolioService, input_hash, verify_dataset


PRIORITIES = ["vpub", "c0", "opex", "kcash", "t_rep", "readiness", "resilience", "scale", "stable_id"]
ASCENDING = [False, True, True, False, False, False, False, False, True]
_search_lock = RLock()


def rank_candidates(frame):
    result = frame.copy(deep=True)
    result["stable_id"] = [space.format_selection(sorted(zip(row.lots.split("+"), row.modes)))
                           for row in result.itertuples()]
    return result.sort_values(PRIORITIES, ascending=ASCENDING, kind="stable").reset_index(drop=True)


@lru_cache(maxsize=2)
def _recommend(dataset_hash: str, require_stress: bool) -> RecommendationResult:
    frame = space.enumerate_space()
    candidates = space.feasible("STRESS" if require_stress else "BASE", frame)
    front = rank_candidates(space.pareto_front(candidates))
    request = RecommendRequest(dataset_hash=dataset_hash, require_stress=require_stress)
    result = RecommendationResult(
        input_hash=input_hash({**request.model_dump(), "engine_version": ENGINE_VERSION}), request=request,
        status="no_feasible" if front.empty else "ok", considered_count=len(frame),
        base_count=int(frame.BASE_ok.sum()), stress_count=int(frame.STRESS_ok.sum()),
        feasible_count=len(candidates), pareto_count=len(front), method=METHOD,
        recommended=None, alternatives=[],
    )
    if front.empty:
        return result

    service = PortfolioService()

    def variant(row, title: str, reason: str) -> RecommendationVariant:
        selection = [SelectionItem(lot_id=lot, mode_id=mode)
                     for lot, mode in space.parse_selection(row.stable_id)]
        return RecommendationVariant(title=title, reason=reason, calculation=service.evaluate(
            EvaluateRequest(dataset_hash=dataset_hash, selection=selection)))

    winner = front.iloc[0]
    result.recommended = variant(winner, "Рекомендованный портфель", METHOD.description)
    options = [
        (front.iloc[1] if len(front) > 1 else winner, "Следующий по приоритетам", "Следующий вариант по тому же правилу выбора."),
        (front.sort_values(["c0", "stable_id"]).iloc[0], "Меньше стартовые затраты", "Минимальный C0 среди недоминируемых вариантов выбранной области."),
        (front.sort_values(["kcash", "stable_id"], ascending=[False, True]).iloc[0], "Больше покрытие расходов", "Максимальный KCASH среди недоминируемых вариантов выбранной области."),
    ]
    used = {winner.stable_id}
    for row, title, reason in options:
        if row.stable_id not in used:
            result.alternatives.append(variant(row, title, reason))
            used.add(row.stable_id)
    return result


class RecommendationService:
    def recommend(self, request: RecommendRequest) -> RecommendationResult:
        verify_dataset(request.dataset_hash)
        with _search_lock:
            result = _recommend(request.dataset_hash, request.require_stress)
        return result.model_copy(deep=True)

    def warmup(self) -> None:
        catalog = PortfolioService().catalog()
        for require_stress in (False, True):
            self.recommend(RecommendRequest(dataset_hash=catalog.dataset_hash, require_stress=require_stress))
