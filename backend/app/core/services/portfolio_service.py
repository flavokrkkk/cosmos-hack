import hashlib
import json
from functools import lru_cache

from app.core.dto.portfolio import (
    AccessMode, Calculation, CaseCatalog, CompareRequest, ComparisonResult,
    ConstraintCheck, ConstraintDefinition, EvaluateRequest, Lot, MethodDefinition,
    PortfolioMetrics, TeamDecisionContext,
)
from app.core.services.portfolio_engine import canonical, constraints
from app.core.services.portfolio_engine.decision import read_decision_config
from app.core.services.portfolio_finance_service import financial_summary
from app.core.services.portfolio_ranking_service import CRITERIA, METHODS
from app.infrastructure.errors.portfolio_errors import DatasetMismatch, InvalidPortfolio


ENGINE_VERSION = "2.0.2"
LOT_TITLES = {
    "FIRE": ("Мониторинг лесных пожаров", "Сибирь"),
    "FLOOD": ("Паводки и оползни", "Дальний Восток"),
    "AGRI": ("Сельхозаналитика", "Юг"),
    "INFRA": ("Деформации инфраструктуры", "Урал–Волга"),
    "ARCTIC": ("Удалённая логистика", "Арктика"),
    "TRANS": ("Мониторинг транспорта", "Центр"),
    "ENV": ("Экологический мониторинг", "Волга–Каспий"),
    "SSA": ("Космическая обстановка", "Федеральный"),
}


def input_hash(value: object) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(payload.encode()).hexdigest()


def verify_dataset(expected: str) -> None:
    if expected != canonical.source_version() or canonical.dataset_hash() != expected:
        raise DatasetMismatch()


@lru_cache(maxsize=1)
def _catalog() -> CaseCatalog:
    lots, modes, config = canonical.load_case()
    records = []
    for row in lots.to_dict("records"):
        title, territory = LOT_TITLES.get(row["lot_id"], (row["service"], row["territorial_archetype"]))
        groups = set()
        for token in row["capability_groups"].split(";"):
            groups.update(canonical.case_core.normalize_capability(token))
        records.append(Lot(**{**row, "capability_groups": sorted(groups)}, title=title, territory_title=territory))
    definitions = {
        scenario: [ConstraintDefinition(**{key: value for key, value in row.items() if key != "metric"})
                   for row in constraints.constraint_definitions(scenario)]
        for scenario in canonical.scenarios()
    }
    decision = read_decision_config()
    return CaseCatalog(
        case_id=config["case_id"], case_version=config["case_version"],
        dataset_hash=canonical.source_version(), engine_version=ENGINE_VERSION,
        lots=records, modes=[AccessMode(**row) for row in modes.to_dict("records")],
        constraints=definitions, methods=METHODS, ranking_criteria=CRITERIA,
        source_refs=[f"case/source/{name}" for name in canonical.SOURCE_FILES],
        team_decision=TeamDecisionContext(**{key: decision[key] for key in
            ("team_name", "strategy_thesis", "management", "assumptions", "algorithm_parameters")}),
    )


class PortfolioService:
    def catalog(self) -> CaseCatalog:
        verify_dataset(canonical.source_version())
        return _catalog().model_copy(deep=True)

    def evaluate(self, request: EvaluateRequest) -> Calculation:
        verify_dataset(request.dataset_hash)
        selection = sorted(request.selection, key=lambda item: (item.lot_id, item.mode_id))
        inputs = request.inputs.model_dump() if request.inputs else None
        try:
            detail, metrics = canonical.evaluate([(item.lot_id, item.mode_id) for item in selection], inputs)
        except ValueError as error:
            raise InvalidPortfolio(str(error)) from error
        checks = {}
        if selection:
            for scenario in canonical.scenarios():
                checks[scenario] = [
                    ConstraintCheck(
                        code=row.code, title=row.title, operator=row.operator, threshold=row.threshold,
                        actual=row.actual, unit=row.unit, slack=row.slack, passed=row.passed,
                    ) for row in constraints.diagnose(metrics, scenario)
                ]
        return Calculation(
            inputs=request.inputs,
            dataset_hash=request.dataset_hash,
            input_hash=input_hash({"dataset": request.dataset_hash, "engine": ENGINE_VERSION,
                                   "inputs": inputs,
                                   "selection": [item.model_dump() for item in selection]}),
            engine_version=ENGINE_VERSION, selection=selection,
            status="complete" if len(selection) == 4 else "incomplete",
            detail=detail.to_dict("records"), metrics=PortfolioMetrics(**metrics) if selection else None,
            financial=financial_summary(selection, metrics, request.inputs),
            checks=checks,
            feasible_by_scenario={scenario: bool(selection) and all(row.passed for row in checks[scenario])
                                  for scenario in canonical.scenarios()},
        )

    def compare(self, request: CompareRequest) -> ComparisonResult:
        variants = [self.evaluate(variant) for variant in request.variants]
        if any(variant.status != "complete" for variant in variants):
            raise InvalidPortfolio("Для сравнения нужны полные портфели из четырёх лотов")
        fields = (
            "c0_mrub", "opex_mrub_per_year", "vpub_mrub_per_year", "cash_mrub_per_year",
            "kcash", "t_rep", "readiness_1_5", "resilience_1_5", "scale_1_5",
        )
        values = [
            {**{key: getattr(variant.metrics, key) for key in fields},
             "annual_surplus_mrub": variant.financial.annual_surplus_mrub}
            for variant in variants
        ]
        baseline = values[0]
        return ComparisonResult(
            variants=variants,
            deltas=[{key: value - baseline[key] for key, value in row.items()} for row in values],
        )
