"""Тонкая обёртка над каноническим кодом организаторов.

Материалы кейса в `case/source/` **не изменяются**: мы их только импортируем и читаем.
Все формулы расчёта берутся из `case_core.py` организаторов — так гарантируется, что
наши числа совпадают с проверкой жюри (критерий Т1) и что исходные условия не подменены
незаметно (критерий Т2).

Свою модель принятия решения мы строим поверх этого слоя, а не вместо него.
"""

from __future__ import annotations

import importlib.util
import hashlib
import os
import sys
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import pandas as pd

REPO_ROOT = next(parent for parent in Path(__file__).resolve().parents
                 if (parent / "config" / "decision.json").is_file())
_DEFAULT_CASE_ROOT = REPO_ROOT / "data" / "official" if (REPO_ROOT / "data" / "official").is_dir() else REPO_ROOT / "case" / "source"
CASE_ROOT = Path(os.environ.get("COSMOS_CASE_SOURCE_DIR", _DEFAULT_CASE_ROOT)).resolve()
SOURCE_FILES = ("case_core.py", "data/lots.csv", "data/access_modes.csv", "config/case_config.json")


def dataset_hash() -> str:
    digest = hashlib.sha256()
    for name in SOURCE_FILES:
        digest.update(name.encode())
        digest.update((CASE_ROOT / name).read_bytes())
    return digest.hexdigest()

#: Пара «лот — режим доступа», например ("FIRE", "A").
Selection = Sequence[Tuple[str, str]]


def _import_case_core():
    """Импортирует case_core.py организаторов по пути, не копируя его в наш код."""
    module_path = CASE_ROOT / "case_core.py"
    if not module_path.exists():
        raise FileNotFoundError(
            f"Не найден канонический case_core.py: {module_path}. "
            "Материалы кейса должны лежать в case/source/ в неизменном виде."
        )
    module_name = "_cosmos_case_core_" + hashlib.sha256(module_path.read_bytes()).hexdigest()
    if module_name in sys.modules:
        return sys.modules[module_name]
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Не удалось загрузить {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


case_core = _import_case_core()
_SOURCE_VERSION = dataset_hash()


@lru_cache(maxsize=1)
def _load_case() -> Tuple[Any, Any, Dict[str, Any]]:
    return case_core.load_case(str(CASE_ROOT))


def load_case(inputs: Dict[str, Any] | None = None) -> Tuple[Any, Any, Dict[str, Any]]:
    if inputs is not None:
        lots = pd.DataFrame([
            {
                "lot_id": row["lot_id"],
                "territorial_archetype": row["territorial_archetype"],
                "service": row["service"],
                "capability_groups": ";".join(row["capability_groups"]),
                "c0_mrub": row["c0_mrub"],
                "opex_mrub_per_year": row["opex_mrub_per_year"],
                "anchor_cash_mrub_per_year": row["anchor_cash_mrub_per_year"],
                "commercial_cash_mrub_per_year": row["commercial_cash_mrub_per_year"],
                "vpub_mrub_per_year": row["vpub_mrub_per_year"],
                "t_rep": row["t_rep"],
                "readiness_1_5": row["readiness_1_5"],
                "resilience_1_5": row["resilience_1_5"],
                "scale_1_5": row["scale_1_5"],
                "federal": row["federal"],
            }
            for row in inputs["lots"]
        ])
        modes = pd.DataFrame(inputs["modes"])
        _, _, config = _load_case()
        return lots, modes, deepcopy(config)
    lots, modes, config = _load_case()
    return lots.copy(deep=True), modes.copy(deep=True), deepcopy(config)


def source_version() -> str:
    return _SOURCE_VERSION


def evaluate(selection: Selection, inputs: Dict[str, Any] | None = None) -> Tuple[Any, Dict[str, Any]]:
    """Канонический расчёт портфеля: возвращает построчную детализацию и показатели."""
    if len(selection) > 4 or len({lot for lot, _ in selection}) != len(selection):
        raise ValueError("Нужно не более четырёх уникальных лотов")
    lots, modes, config = load_case(inputs)
    return case_core.evaluate_portfolio(sorted(selection), lots, modes, config)


def canonical_checks(metrics: Dict[str, Any], scenario: str = "BASE") -> Dict[str, bool]:
    """Канонический ответ PASS/FAIL по каждому ограничению — как его увидит жюри."""
    _, _, config = load_case()
    frame = case_core.check_constraints(metrics, config, scenario=scenario)
    return {row.constraint: bool(row.ok) for row in frame.itertuples()}


def lot_ids(inputs: Dict[str, Any] | None = None) -> List[str]:
    lots, _, _ = load_case(inputs)
    return list(lots.lot_id)


def mode_ids(inputs: Dict[str, Any] | None = None) -> List[str]:
    _, modes, _ = load_case(inputs)
    return list(modes.mode_id)


def scenarios() -> List[str]:
    _, _, config = load_case()
    return list(config["scenarios"].keys())
