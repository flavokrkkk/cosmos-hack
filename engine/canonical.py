"""Тонкая обёртка над каноническим кодом организаторов.

Материалы кейса в `case/source/` **не изменяются**: мы их только импортируем и читаем.
Все формулы расчёта берутся из `case_core.py` организаторов — так гарантируется, что
наши числа совпадают с проверкой жюри (критерий Т1) и что исходные условия не подменены
незаметно (критерий Т2).

Свою модель принятия решения мы строим поверх этого слоя, а не вместо него.
"""

from __future__ import annotations

import importlib.util
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
CASE_ROOT = REPO_ROOT / "case" / "source"

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
    if "case_core" in sys.modules:
        return sys.modules["case_core"]
    spec = importlib.util.spec_from_file_location("case_core", module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Не удалось загрузить {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["case_core"] = module
    spec.loader.exec_module(module)
    return module


case_core = _import_case_core()


@lru_cache(maxsize=1)
def load_case() -> Tuple[Any, Any, Dict[str, Any]]:
    """Загружает лоты, режимы доступа и конфигурацию кейса из `case/source/`."""
    return case_core.load_case(str(CASE_ROOT))


def evaluate(selection: Selection) -> Tuple[Any, Dict[str, Any]]:
    """Канонический расчёт портфеля: возвращает построчную детализацию и показатели."""
    lots, modes, config = load_case()
    return case_core.evaluate_portfolio(list(selection), lots, modes, config)


def canonical_checks(metrics: Dict[str, Any], scenario: str = "BASE") -> Dict[str, bool]:
    """Канонический ответ PASS/FAIL по каждому ограничению — как его увидит жюри."""
    _, _, config = load_case()
    frame = case_core.check_constraints(metrics, config, scenario=scenario)
    return {row.constraint: bool(row.ok) for row in frame.itertuples()}


def lot_ids() -> List[str]:
    lots, _, _ = load_case()
    return list(lots.lot_id)


def mode_ids() -> List[str]:
    _, modes, _ = load_case()
    return list(modes.mode_id)


def scenarios() -> List[str]:
    _, _, config = load_case()
    return list(config["scenarios"].keys())
