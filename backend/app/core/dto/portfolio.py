from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


Scenario = Literal["BASE", "STRESS"]
DatasetHash = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class PortfolioSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class SelectionItem(PortfolioSchema):
    lot_id: str = Field(min_length=1, max_length=32)
    mode_id: str = Field(min_length=1, max_length=8)


class EvaluateRequest(PortfolioSchema):
    dataset_hash: DatasetHash
    selection: list[SelectionItem] = Field(max_length=4)

    @model_validator(mode="after")
    def unique_lots(self) -> Self:
        if len({item.lot_id for item in self.selection}) != len(self.selection):
            raise ValueError("Каждый лот можно выбрать только один раз")
        return self


class RecommendRequest(PortfolioSchema):
    dataset_hash: DatasetHash
    require_stress: bool = Field(default=True, strict=True)
    method_id: Literal["hybrid_maximin_v1"] = "hybrid_maximin_v1"
    cash_loss_limit_mrub: float | None = Field(default=None, ge=0, strict=True, description="Δ, млн ₽/год. null — минимальная потеря S для достижения глобального максимума Q.")
    quality_epsilon: Literal[0] = 0
    budget_cap_mrub: float | None = Field(default=None, gt=0, strict=True)
    vpub_floor_mrub_per_year: float | None = Field(default=None, ge=0, strict=True)
    required_public_lot_ids: list[str] = Field(default_factory=list, max_length=4)
    lot_ids: list[Annotated[str, Field(min_length=1, max_length=32)]] | None = Field(
        default=None, min_length=4, max_length=8,
        description=(
            "От четырёх до восьми лотов-кандидатов. Алгоритм перебирает все портфели "
            "из четырёх лотов и режимы внутри этого списка; null — полный автоподбор."
        ),
    )

    with_explanations: bool = Field(
        default=True, strict=True,
        description=(
            "false — только расчёт и фронт, без пакетного объяснения Ollama: ответ за доли секунды. "
            "Фронтенд сначала показывает числа, а объяснения запрашивает вторым вызовом."
        ),
    )

    @model_validator(mode="after")
    def unique_fixed_lots(self) -> Self:
        if len(set(self.required_public_lot_ids)) != len(self.required_public_lot_ids):
            raise ValueError("Обязательные общественные лоты не должны повторяться")
        self.required_public_lot_ids = sorted(self.required_public_lot_ids)
        if self.lot_ids is not None and not set(self.required_public_lot_ids).issubset(self.lot_ids):
            raise ValueError("Обязательные общественные лоты должны входить в область поиска")
        if self.lot_ids is not None:
            if len(set(self.lot_ids)) != len(self.lot_ids):
                raise ValueError("Каждый лот можно выбрать только один раз")
            self.lot_ids = sorted(self.lot_ids)
        return self


class CompareRequest(PortfolioSchema):
    variants: list[EvaluateRequest] = Field(min_length=2, max_length=4)


class Lot(PortfolioSchema):
    lot_id: str
    title: str
    service: str
    territorial_archetype: str
    territory_title: str
    capability_groups: list[str]
    federal: bool
    c0_mrub: float
    opex_mrub_per_year: float
    anchor_cash_mrub_per_year: float
    commercial_cash_mrub_per_year: float
    vpub_mrub_per_year: float
    t_rep: float
    readiness_1_5: float
    resilience_1_5: float
    scale_1_5: float


class AccessMode(PortfolioSchema):
    mode_id: str
    k_c0: float
    k_opex: float
    k_vpub: float
    k_anchor: float
    k_commercial: float
    public_core: bool


class ConstraintDefinition(PortfolioSchema):
    code: str
    title: str
    operator: Literal["==", "<=", ">="]
    threshold: float
    unit: str


class ConstraintCheck(ConstraintDefinition):
    actual: float
    slack: float | None
    passed: bool


class MethodDefinition(PortfolioSchema):
    id: str
    title: str
    priorities: list[str]
    description: str
    origin: Literal["допущение"] = "допущение"


class CaseCatalog(PortfolioSchema):
    case_id: str
    case_version: str
    dataset_hash: DatasetHash
    engine_version: str
    lots: list[Lot]
    modes: list[AccessMode]
    constraints: dict[Scenario, list[ConstraintDefinition]]
    methods: list[MethodDefinition]
    ranking_criteria: list["RankingCriterion"] = Field(default_factory=list)
    source_refs: list[str]
    origin: Literal["постановка"] = "постановка"


class PortfolioMetrics(PortfolioSchema):
    selected_lots: int
    c0_mrub: float
    opex_mrub_per_year: float
    vpub_mrub_per_year: float
    cash_mrub_per_year: float
    kcash: float
    t_rep: float
    readiness_1_5: float
    resilience_1_5: float
    scale_1_5: float
    territorial_archetypes: int
    capability_groups: int
    capability_set: list[str]
    public_core_lots: int


class LotDetail(PortfolioSchema):
    lot_id: str
    mode_id: str
    c0_mrub: float
    opex_mrub_per_year: float
    vpub_mrub_per_year: float
    cash_mrub_per_year: float
    t_rep: float
    readiness_1_5: float
    resilience_1_5: float
    scale_1_5: float
    territorial_archetype: str
    federal: bool
    capability_groups: str
    public_core: bool


class FinancialSummary(PortfolioSchema):
    annual_surplus_mrub: float
    annual_funding_gap_mrub: float
    operating_self_financed: bool
    anchor_cash_mrub_per_year: float
    commercial_cash_mrub_per_year: float
    cash_drop_break_even_pct: float | None
    opex_growth_break_even_pct: float | None
    startup_headroom_mrub: dict[Scenario, float]
    public_lot_ids: list[str]
    limitation: str = "CASH − OPEX — годовой остаток портфеля, не чистая прибыль и не возврат вложений. Запас рассчитан при неизменных остальных показателях; схема распределения денег требует отдельного обоснования."


class Calculation(PortfolioSchema):
    dataset_hash: DatasetHash
    input_hash: str
    engine_version: str
    selection: list[SelectionItem]
    status: Literal["incomplete", "complete"]
    detail: list[LotDetail]
    metrics: PortfolioMetrics | None
    checks: dict[Scenario, list[ConstraintCheck]]
    feasible_by_scenario: dict[Scenario, bool]
    financial: FinancialSummary | None = None


class RankingCriterion(PortfolioSchema):
    key: str
    title: str
    direction: Literal["max", "min"]


class ScoreComponent(RankingCriterion):
    raw: float
    minimum: float
    maximum: float
    normalized: float
    bottleneck: bool


class MethodOutcome(PortfolioSchema):
    method_id: str
    selection_id: str
    selection: list[SelectionItem]
    c0_mrub: float
    vpub_mrub_per_year: float
    annual_surplus_mrub: float
    kcash: float
    q: float
    q_exact: str
    components: list[ScoreComponent] = Field(default_factory=list)


class SensitivityOutcome(PortfolioSchema):
    winner: MethodOutcome | None
    winner_changed: bool
    original_still_feasible: bool
    original_adjusted_surplus_mrub: float | None


class SensitivityCase(PortfolioSchema):
    id: str
    title: str
    origin: Literal["допущение"] = "допущение"
    budget_cap_mrub: float
    vpub_floor_mrub_per_year: float
    required_public_lot_ids: list[str]
    cash_multiplier: float = 1
    opex_multiplier: float = 1
    feasible_count: int
    outcome: SensitivityOutcome
    s_max_mrub: float | None
    cash_floor_mrub: float | None
    cash_eligible_count: int
    q_max: float | None
    effective_delta_mrub: float | None


class SwitchingPoint(PortfolioSchema):
    delta_from_mrub: float
    delta_to_exclusive_mrub: float | None
    winner: MethodOutcome


class DecisionAnalysis(PortfolioSchema):
    winner: MethodOutcome | None
    s_max_mrub: float | None
    cash_floor_mrub: float | None
    cash_eligible_count: int
    q_max: float | None
    effective_delta_mrub: float | None
    cash_loss_limit_mrub: float | None
    quality_epsilon: Literal[0] = 0
    reference_count: int
    bounds: dict[str, tuple[float, float]]
    switching_curve: list[SwitchingPoint]
    sensitivity: list[SensitivityCase]
    pareto_objectives: list[str]
    normalization: str
    caveat: str


class RecommendationVariant(PortfolioSchema):
    title: str
    reason: str
    calculation: Calculation
    explanation: "RecommendationExplanation | None" = None


class RecommendationResult(PortfolioSchema):
    input_hash: str
    request: RecommendRequest
    status: Literal["ok", "no_feasible"]
    considered_count: int
    base_count: int
    stress_count: int
    feasible_count: int
    pareto_count: int
    method: MethodDefinition
    recommended: RecommendationVariant | None
    alternatives: list[RecommendationVariant]
    analysis: DecisionAnalysis | None = None


class ComparisonResult(PortfolioSchema):
    variants: list[Calculation]
    deltas: list[dict[str, float]]
    baseline_index: int = 0


class PortfolioExplanationRequest(PortfolioSchema):
    dataset_hash: DatasetHash
    selection: list[SelectionItem] = Field(min_length=4, max_length=4)
    scenario: Scenario = "STRESS"

    @model_validator(mode="after")
    def unique_lots(self) -> Self:
        if len({item.lot_id for item in self.selection}) != len(self.selection):
            raise ValueError("Каждый лот можно выбрать только один раз")
        self.selection = sorted(self.selection, key=lambda item: (item.lot_id, item.mode_id))
        return self


class ExplanationFact(PortfolioSchema):
    id: str
    text: str
    source: Literal["calculation", "system"]
    kind: Literal["strength", "limitation", "context"] = "context"


class ExplanationPoint(PortfolioSchema):
    text: str
    fact_ids: list[str]


class PortfolioExplanation(PortfolioSchema):
    headline: str
    summary: str
    strengths: list[ExplanationPoint]
    limitations: list[ExplanationPoint]


class PortfolioExplanationResult(PortfolioSchema):
    calculation: Calculation
    scenario: Scenario
    facts: list[ExplanationFact]
    explanation: PortfolioExplanation
    model: str | None
    generated_by: Literal["ollama", "template"]
    warning: str | None = None


class RecommendationExplanation(PortfolioSchema):
    input_hash: str
    scenario: Scenario
    facts: list[ExplanationFact]
    explanation: PortfolioExplanation
    model: str | None
    generated_by: Literal["ollama", "template"]
    warning: str | None = None
    composition: Literal["generative", "extractive"] = "generative"


class ComparisonAnalysisRequest(CompareRequest):
    scenario: Scenario = "STRESS"

    @model_validator(mode="after")
    def distinct_complete_variants(self) -> Self:
        selections = [tuple(sorted((item.lot_id, item.mode_id) for item in variant.selection)) for variant in self.variants]
        if any(len(selection) != 4 for selection in selections):
            raise ValueError("Для анализа нужны полные портфели из четырёх лотов")
        if len(set(selections)) != len(selections):
            raise ValueError("Выберите разные портфели для анализа")
        return self


class ComparisonAnalysisResult(RecommendationExplanation):
    comparison: ComparisonResult


RecommendationVariant.model_rebuild()
RecommendationResult.model_rebuild()
CaseCatalog.model_rebuild()
