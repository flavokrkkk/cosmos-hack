"""DTO-адаптер единственного автономного алгоритма portfolio_engine.hybrid."""
from app.core.dto.portfolio import DecisionAnalysis, MethodDefinition, RankingCriterion, RecommendRequest
from app.core.services.portfolio_engine import hybrid

CRITERIA = [RankingCriterion(key=key, title=title, direction=direction) for key, title, direction in hybrid.CRITERIA]
METHOD = MethodDefinition(
    id=hybrid.METHOD_ID, title="Баланс критериев с денежным ограничением",
    priorities=["Официальные BASE/STRESS и явные дополнительные условия",
                "S ≥ Smax − Δ", "Максимум Q = min шести нормированных оценок; ε = 0",
                "При равном Q: максимум S, затем сумма оценок, затем стабильный ID"],
    description="Выбираем портфель с наилучшей слабой оценкой в пределах допустимой потери годового денежного остатка. "
                "Автоматический Δ — минимальная потеря S для достижения максимального Q; его можно ужесточить вручную. "
                "Шкалы и правило — явные предпочтения команды, а не формула жюри.",
)
METHODS = [METHOD]


def analyze(request: RecommendRequest):
    parameters = hybrid.Parameters(**request.model_dump(exclude={"dataset_hash", "method_id", "with_explanations"}))
    frame, candidates, analysis = hybrid.analyze(parameters)
    return frame, candidates, DecisionAnalysis(**analysis)
