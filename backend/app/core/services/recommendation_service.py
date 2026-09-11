from functools import lru_cache
from threading import RLock

from app.core.dto.portfolio import (
    EvaluateRequest, RecommendRequest, RecommendationResult, RecommendationVariant, SelectionItem,
)
from app.core.services.portfolio_engine import space
from app.core.services.portfolio_service import ENGINE_VERSION, METHOD, PortfolioService, input_hash, verify_dataset
from app.infrastructure.errors.portfolio_errors import InvalidPortfolio


# ─────────────────────────────────────────────────────────────────────────────
# ПРАВКА 12.09.2026 — алгоритм перестал короновать победителя
#
# Было: `recommended` — первый вариант после сортировки по PRIORITIES, то есть
# по `vpub`. На данных кейса 1.1 максимум `vpub` на фронте делит РОВНО ОДНА
# конфигурация — проверено и в полном поиске, и во всех 33 областях с фиксацией
# лотов. Поэтому до тайбрейка дело не доходило ни разу, и метод фактически
# работал как «максимизируй общественную ценность». Это свойство ЭТИХ данных,
# а не доказанное свойство метода: на других входах равенства возможны.
# Инструмент выдавал
# FLOOD+AGRI+TRANS+ENV с запасом 6,0 млн ₽ против стрессового лимита, а
# управленческая записка защищает FIRE+AGRI+TRANS+ENV с запасом 27,0.
# Организаторы требуют, чтобы числа записки, слайдов и вывода кода совпадали.
#
# Стало: алгоритм отдаёт то, что действительно вычисляет, — фронт и его
# ОПОРНЫЕ ТОЧКИ (крайние по каждому показателю). Выбор одной конфигурации
# из фронта — решение команды, оно приходит из config/decision.json и помечено
# отдельно от машинного результата.
#
# Почему не «починили» приоритеты так, чтобы победил портфель записки:
# это подгонка. Правило, объясняющее ровно один вариант, объясняет только себя.
# Мы проверили две независимые формализации выбора — лексикографическую
# и максимин по нормированным (ценность, запас) — ни одна не выбирает
# портфель записки: первая даёт FLOOD…/AABA, вторая FIRE…/ACAA. Это и есть
# доказательство, что шаг «60 → 1» не выводится из данных и является
# управленческим решением. Так он теперь и подан.
#
# Разбор: docs/notes/2026-09-12-tool-note-alignment.md
# ─────────────────────────────────────────────────────────────────────────────

PRIORITIES = ["vpub", "c0", "opex", "kcash", "t_rep", "readiness", "resilience", "scale", "stable_id"]
ASCENDING = [False, True, True, False, False, False, False, False, True]

#: Опорные точки фронта: имя, колонка, направление, чем она интересна.
#: Это крайние значения, вычисляемые объективно, а не предпочтения команды.
REFERENCE_POINTS = [
    ("vpub", False, "Наибольшая общественная ценность",
     "Максимум VPUB среди недоминируемых. Цена максимума видна в остальных столбцах."),
    ("c0", True, "Наименьшие стартовые затраты",
     "Минимум C0 среди недоминируемых: наибольший запас до бюджетного лимита."),
    ("kcash", False, "Наибольшее покрытие расходов",
     "Максимум KCASH: отношение годовых поступлений к годовым расходам, не прибыль."),
    ("t_rep", False, "Наибольшая тиражируемость",
     "Максимум среднего t_rep: портфель легче переносится в следующий регион."),
]

_search_lock = RLock()


@lru_cache(maxsize=1)
def _team_selection() -> str | None:
    """Портфель, который защищает управленческая записка, в виде stable_id.

    Источник — config/decision.json, то же место, откуда его берёт CLI. Если
    конфиг недоступен или повреждён, возвращаем None: инструмент тогда покажет
    только опорные точки фронта и не выдаст ничего за выбор команды.
    """
    try:
        from app.core.services.portfolio_engine.decision import load_decision

        selection = load_decision().recommended.selection
        return space.format_selection(sorted((lot, mode) for lot, mode in selection))
    except Exception:  # noqa: BLE001 — отсутствие конфига не должно ронять подбор
        return None


def rank_candidates(frame):
    result = frame.copy(deep=True)
    result["stable_id"] = [space.format_selection(sorted(zip(row.lots.split("+"), row.modes)))
                           for row in result.itertuples()]
    return result.sort_values(PRIORITIES, ascending=ASCENDING, kind="stable").reset_index(drop=True)


@lru_cache(maxsize=256)
def _recommend(dataset_hash: str, require_stress: bool, lot_ids: tuple[str, ...] | None = None) -> RecommendationResult:
    frame = space.enumerate_space()
    if lot_ids is not None:
        selected_lots = frozenset(lot_ids)
        frame = frame[
            frame.lots.map(lambda value: set(value.split("+")).issubset(selected_lots))
        ]
    candidates = space.feasible("STRESS" if require_stress else "BASE", frame)
    front = rank_candidates(space.pareto_front(candidates))
    request = RecommendRequest(dataset_hash=dataset_hash, require_stress=require_stress,
                               lot_ids=list(lot_ids) if lot_ids is not None else None)
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

    # Выбор команды — вход, а не результат перебора. Берём его из конфига
    # и проверяем, что он лежит в области поиска и на фронте; если нет, честно
    # оставляем пустым, а не подменяем машинным «победителем».
    team = _team_selection()
    if team is not None:
        on_front = front[front.stable_id == team]
        if not on_front.empty:
            result.recommended = variant(
                on_front.iloc[0],
                "Портфель команды",
                "Выбран командой по правилу из управленческой записки: проходит STRESS без "
                "пересмотра состава, эксплуатация окупает себя (KCASH >= 1,0), общественное "
                "ядро выше нормативного минимума, и точка выбрана на изломе обмена "
                "общественной ценности на запас прочности. Это решение команды, а не "
                "результат вычисления: внутри фронта объективных оснований предпочесть "
                "один вариант другому не существует.",
            )

    # Опорные точки фронта: крайние значения по каждому показателю. Вычисляются
    # объективно и показывают ГРАНИЦЫ возможного, а не то, что следует выбрать.
    used = {team} if result.recommended else set()
    for column, ascending, title, reason in REFERENCE_POINTS:
        row = front.sort_values([column, "stable_id"], ascending=[ascending, True]).iloc[0]
        if row.stable_id in used:
            continue
        result.alternatives.append(variant(row, title, reason))
        used.add(row.stable_id)

    return result


class RecommendationService:
    def recommend(self, request: RecommendRequest) -> RecommendationResult:
        verify_dataset(request.dataset_hash)
        if request.lot_ids is not None:
            known_lots = {lot.lot_id for lot in PortfolioService().catalog().lots}
            unknown = set(request.lot_ids) - known_lots
            if unknown:
                raise InvalidPortfolio(f"Неизвестные лоты: {', '.join(sorted(unknown))}")
        lot_ids = tuple(sorted(request.lot_ids)) if request.lot_ids is not None else None
        with _search_lock:
            result = _recommend(request.dataset_hash, request.require_stress, lot_ids)
        return result.model_copy(deep=True)

    def warmup(self) -> None:
        catalog = PortfolioService().catalog()
        for require_stress in (False, True):
            self.recommend(RecommendRequest(dataset_hash=catalog.dataset_hash, require_stress=require_stress))
