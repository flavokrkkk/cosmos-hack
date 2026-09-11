import hashlib
import json
from functools import lru_cache

from app.core.dto.portfolio import (
    AccessMode, Calculation, CaseCatalog, CompareRequest, ComparisonResult,
    ConstraintCheck, ConstraintDefinition, EvaluateRequest, Lot, MethodDefinition,
    PortfolioMetrics,
)
from app.core.services.portfolio_engine import canonical, constraints
from app.infrastructure.errors.portfolio_errors import DatasetMismatch, InvalidPortfolio


ENGINE_VERSION = "1.0.0"
METHOD = MethodDefinition(
    id="pareto_lexicographic_v1",
    title="Общественный эффект в заданных условиях",
    priorities=["VPUB больше", "C0 меньше", "OPEX меньше", "KCASH больше", "t_rep больше", "readiness больше", "resilience больше", "scale больше"],
    description="Максимум общественного эффекта; при равенстве — меньше стартовые и годовые затраты, "
    "затем выше покрытие расходов и индексы. При полном равенстве — стабильный ID. "
    "Это правило команды, не взвешенный рейтинг.",
)
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
    return CaseCatalog(
        case_id=config["case_id"], case_version=config["case_version"],
        dataset_hash=canonical.source_version(), engine_version=ENGINE_VERSION,
        lots=records, modes=[AccessMode(**row) for row in modes.to_dict("records")],
        constraints=definitions, methods=[METHOD],
        source_refs=[f"case/source/{name}" for name in canonical.SOURCE_FILES],
    )


class PortfolioService:
    def catalog(self) -> CaseCatalog:
        verify_dataset(canonical.source_version())
        return _catalog().model_copy(deep=True)

    def evaluate(self, request: EvaluateRequest) -> Calculation:
        verify_dataset(request.dataset_hash)
        selection = sorted(request.selection, key=lambda item: (item.lot_id, item.mode_id))
        try:
            detail, metrics = canonical.evaluate([(item.lot_id, item.mode_id) for item in selection])
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
            dataset_hash=request.dataset_hash,
            input_hash=input_hash({"dataset": request.dataset_hash, "engine": ENGINE_VERSION,
                                   "selection": [item.model_dump() for item in selection]}),
            engine_version=ENGINE_VERSION, selection=selection,
            status="complete" if len(selection) == 4 else "incomplete",
            detail=detail.to_dict("records"), metrics=PortfolioMetrics(**metrics) if selection else None,
            checks=checks,
            feasible_by_scenario={scenario: bool(selection) and all(row.passed for row in checks[scenario])
                                  for scenario in canonical.scenarios()},
        )

    def compare(self, request: CompareRequest) -> ComparisonResult:
        variants = [self.evaluate(variant) for variant in request.variants]
        if any(variant.status != "complete" for variant in variants):
            raise InvalidPortfolio("Для сравнения нужны полные портфели из четырёх лотов")
        baseline = variants[0].metrics.model_dump()
        fields = ("c0_mrub", "opex_mrub_per_year", "vpub_mrub_per_year", "cash_mrub_per_year", "kcash", "t_rep")
        return ComparisonResult(
            variants=variants,
            deltas=[{key: variant.metrics.model_dump()[key] - baseline[key] for key in fields}
                    for variant in variants],
        )
